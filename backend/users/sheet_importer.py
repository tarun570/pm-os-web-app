"""
Import the sprint-plan data from a Google Sheet into the local DB.

The n8n workflow writes the sprint plan into a Google Sheet in the user's
Drive and POSTs back the `sheet_link` (and links to the PRD document) to
`webhook_callback`. Until this module runs, Django only has those links —
it cannot answer chatbot questions about user stories, resources, or
sprint tasks.

This module:
  1. Pulls the spreadsheet ID out of a Google Sheets URL.
  2. Asks the Google Sheets API (v4) for the values of the 3 sub-sheets:
     - "UserStories"  →  UserStory
     - "Resources"    →  Resource
     - "Sprint Plan"  →  SprintPlanRow
  3. Inside a single transaction, wipes this upload's existing rows and
     rewrites them from scratch (idempotent — safe to call repeatedly).

The first row of each sub-sheet is treated as the header. We map known
column names case-insensitively; unknown columns are ignored. This means
n8n can add a "Notes" column tomorrow and we won't crash — we'll just
drop it on the floor with a debug log.

Auth:
  We re-use the user's existing GoogleOAuthToken (the same one n8n uses
  to write to their Drive) to call the Sheets API. The `drive.file`
  scope covers reading any file the app created in that user's Drive,
  which the sheet qualifies as.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import requests as http_requests
from django.db import transaction

from users import google_drive
from users.models import FileUpload, Resource, SprintPlanRow, UserStory


# Sub-sheet names as written by the n8n workflow. These are the tab titles
# in the Google Sheet. If n8n renames them, update here AND in the n8n
# workflow so they stay in sync.
USER_STORIES_TAB = "User_Stories"
RESOURCES_TAB = "Resource"
SPRINT_PLAN_TAB = "Sprint_Plan"

# Map: sheet header (lowercased) → field name on the model.
# Add entries here if the sheet ever grows a new column.
USER_STORY_COLUMN_MAP = {
    "projectname": "project_name",
    "project_name": "project_name",
    "userstories": "user_story",
    "user_story": "user_story",
    "user story": "user_story",
    "userstories (the as-a-user-i-want)": "user_story",
}

RESOURCE_COLUMN_MAP = {
    "projectname": "project_name",
    "project_name": "project_name",
    "resourcetype": "resource_type",
    "resource_type": "resource_type",
    "resourcename": "resource_name",
    "resource_name": "resource_name",
    "availablehours": "available_hours",
    "available_hours": "available_hours",
    "sprintduration": "sprint_duration",
    "sprint_duration": "sprint_duration",
}

SPRINT_PLAN_COLUMN_MAP = {
    "projectname": "project_name",
    "project_name": "project_name",
    "userstory": "user_story_text",  # raw text, used to resolve the FK
    "user_story": "user_story_text",
    "user story": "user_story_text",
    "us_id": "us_id",
    "usid": "us_id",
    "task": "task",
    "resources": "resource_name",  # raw text, used to resolve the FK
    "startdate": "start_date",
    "start_date": "start_date",
    "enddate": "end_date",
    "end_date": "end_date",
    "esthours": "est_hours",
    "est_hours": "est_hours",
    "sprint": "sprint",
    "priority": "priority",
    "status": "status",
}

# Date formats we'll try, in order. n8n typically emits ISO 8601, but the
# sample data also showed DD-MM-YY, so we cover both.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%d-%m-%y",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%m/%d/%Y",
)


class SheetImportError(Exception):
    """Raised when the sheet can't be read or the data is unusable."""


def extract_spreadsheet_id(sheet_link: str) -> str:
    """Pull the spreadsheet ID out of a Google Sheets URL.

    Accepts forms like:
      https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
      https://docs.google.com/spreadsheets/d/<ID>/edit
      https://docs.google.com/spreadsheets/d/<ID>

    Returns the bare ID. Raises SheetImportError if the URL is malformed
    or the ID can't be located.
    """
    if not sheet_link:
        raise SheetImportError("sheet_link is empty")

    # Try the standard /d/<id>/ form first.
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_link)
    if match:
        return match.group(1)

    # Fallback: maybe it's a URL with a key= param (rare, but Google has
    # used these for older sheets).
    parsed = urlparse(sheet_link)
    qs = parsed.query or ""
    match = re.search(r"(?:^|&)key=([a-zA-Z0-9-_]+)", qs)
    if match:
        return match.group(1)

    raise SheetImportError(
        f"Could not extract spreadsheet ID from sheet_link: {sheet_link!r}"
    )


def _coerce_date(value: Any):
    """Best-effort parse a date-ish value into a date or None."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    s = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _coerce_int(value: Any):
    """Best-effort parse an int-ish value into an int or None."""
    if value in (None, ""):
        return None
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def _row_to_dict(headers: list[str], row: list[str], column_map: dict) -> dict:
    """Project a row's values into the field names the model expects.

    Headers and row must be the same length; we zip them. Unknown headers
    are skipped. Missing trailing values become empty strings.
    """
    # Pad row to header length so zip is safe.
    padded = list(row) + [""] * (len(headers) - len(row))
    out = {}
    for header, cell in zip(headers, padded):
        key = column_map.get(header.strip().lower())
        if key:
            out[key] = cell.strip() if isinstance(cell, str) else cell
    return out


def _fetch_sheet_values(access_token: str, spreadsheet_id: str, tab_name: str) -> list[list[str]]:
    """Call the Google Sheets API values.get for one tab.

    Returns a list of rows; the first row is the header. Returns an empty
    list (not a 404) if the tab is missing — n8n may have skipped it.
    """
    # Encode the tab name so spaces become %20 etc.
    from urllib.parse import quote
    range_a1 = f"{quote(tab_name)}!A1:Z"
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        f"/values/{range_a1}"
    )
    headers = {"Authorization": f"Bearer {access_token}"}
    response = http_requests.get(url, headers=headers, timeout=30)

    if response.status_code == 400:
        # Likely "tab not found". Return empty rows so the importer
        # continues with whatever it has.
        return []
    if response.status_code != 200:
        raise SheetImportError(
            f"Sheets API error {response.status_code} reading {tab_name!r}: "
            f"{response.text[:300]}"
        )
    body = response.json()
    return body.get("values", []) or []


def _read_sub_sheet(access_token: str, spreadsheet_id: str, tab_name: str,
                    column_map: dict) -> list[dict]:
    """Read one sub-sheet, return a list of dicts keyed by model field names.

    Skips empty rows. If the sheet is empty or has only a header, returns [].
    """
    rows = _fetch_sheet_values(access_token, spreadsheet_id, tab_name)
    if len(rows) < 2:
        return []
    headers = rows[0]
    out = []
    for row in rows[1:]:
        # Skip rows that are entirely empty (Sheets returns these for blank
        # trailing rows sometimes).
        if not any(str(c).strip() for c in row):
            continue
        out.append(_row_to_dict(headers, row, column_map))
    return out


def populate_sprint_plan_from_sheet(file_upload: FileUpload) -> dict:
    """Read the 3 sub-sheets from file_upload's sheet_link and populate the DB.

    Idempotent: any existing UserStory / Resource / SprintPlanRow rows for
    this file_upload are deleted and re-created in a single transaction.

    Returns a dict with counts:
        {"user_stories": int, "resources": int, "sprint_plan_rows": int}

    Raises SheetImportError if the sheet can't be reached. Other errors
    (e.g. unexpected value shape) are logged in-band and result in a
    partial import — the user-visible counts reflect what was actually
    written.
    """
    sheet_link = None
    if isinstance(file_upload.processing_result, dict):
        sheet_link = file_upload.processing_result.get("sheet_link")
    if not sheet_link:
        raise SheetImportError(
            f"FileUpload {file_upload.id} has no sheet_link in processing_result"
        )

    spreadsheet_id = extract_spreadsheet_id(sheet_link)
    access_token = google_drive.get_valid_access_token(file_upload.user)

    user_story_payloads = _read_sub_sheet(
        access_token, spreadsheet_id, USER_STORIES_TAB, USER_STORY_COLUMN_MAP,
    )
    resource_payloads = _read_sub_sheet(
        access_token, spreadsheet_id, RESOURCES_TAB, RESOURCE_COLUMN_MAP,
    )
    sprint_plan_payloads = _read_sub_sheet(
        access_token, spreadsheet_id, SPRINT_PLAN_TAB, SPRINT_PLAN_COLUMN_MAP,
    )

    with transaction.atomic():
        # Wipe and rewrite — idempotent on re-run.
        UserStory.objects.filter(file_upload=file_upload).delete()
        Resource.objects.filter(file_upload=file_upload).delete()
        SprintPlanRow.objects.filter(file_upload=file_upload).delete()

        # 1. User stories
        us_by_text: dict[str, UserStory] = {}
        if user_story_payloads:
            us_rows = [
                UserStory(
                    file_upload=file_upload,
                    project_name=p.get("project_name", ""),
                    user_story=p.get("user_story", ""),
                )
                for p in user_story_payloads
            ]
            created = UserStory.objects.bulk_create(us_rows)
            for row, payload in zip(created, user_story_payloads):
                us_by_text[(payload.get("user_story") or "").strip()] = row

        # 2. Resources
        res_by_name: dict[str, Resource] = {}
        if resource_payloads:
            res_rows = [
                Resource(
                    file_upload=file_upload,
                    project_name=p.get("project_name", ""),
                    resource_type=p.get("resource_type", ""),
                    resource_name=p.get("resource_name", ""),
                    available_hours=_coerce_int(p.get("available_hours")),
                    sprint_duration=p.get("sprint_duration", ""),
                )
                for p in resource_payloads
            ]
            created = Resource.objects.bulk_create(res_rows)
            for row, payload in zip(created, resource_payloads):
                res_by_name[(payload.get("resource_name") or "").strip()] = row

        # 3. Sprint plan rows — FKs resolved by string match.
        if sprint_plan_payloads:
            sp_rows = []
            for p in sprint_plan_payloads:
                us_text = (p.get("user_story_text") or "").strip()
                r_name = (p.get("resource_name") or "").strip()
                sp_rows.append(SprintPlanRow(
                    file_upload=file_upload,
                    project_name=p.get("project_name", ""),
                    user_story=us_by_text.get(us_text),
                    # Persist the raw sheet cell even when FK resolution
                    # fails — the chatbot reads this when user_story (FK)
                    # is NULL. Idempotent on re-run because bulk_create
                    # below replaces the row wholesale.
                    user_story_text=us_text,
                    us_id=str(p.get("us_id") or "").strip(),
                    task=p.get("task", ""),
                    resources=res_by_name.get(r_name),
                    resource_name=r_name,
                    start_date=_coerce_date(p.get("start_date")),
                    end_date=_coerce_date(p.get("end_date")),
                    est_hours=_coerce_int(p.get("est_hours")),
                    sprint=p.get("sprint", ""),
                    priority=p.get("priority", ""),
                    status=p.get("status", ""),
                ))
            SprintPlanRow.objects.bulk_create(sp_rows)

        # 4. us_id backfill on UserStory. Sprint Plan carries the
        #    canonical `US-N` label keyed by user_story text; we mirror
        #    that label back onto the UserStory row so the chatbot can
        #    address a story by label (e.g. ?us_id=US-3) instead of
        #    fuzzy-joining on text. If the same text maps to multiple
        #    us_ids, take the first and log a warning.
        if sprint_plan_payloads:
            from collections import defaultdict
            text_to_usids: dict[str, list[str]] = defaultdict(list)
            for p in sprint_plan_payloads:
                text = (p.get("user_story_text") or "").strip()
                usid = str(p.get("us_id") or "").strip()
                if text and usid and usid not in text_to_usids[text]:
                    text_to_usids[text].append(usid)

            for text, usids in text_to_usids.items():
                if len(usids) > 1:
                    print(
                        f"[SHEET IMPORT] ⚠️  upload={file_upload.id} "
                        f"user_story text maps to multiple us_ids "
                        f"{usids!r}; using first ({usids[0]!r})"
                    )
                UserStory.objects.filter(
                    file_upload=file_upload, user_story=text,
                ).update(us_id=usids[0])

    counts = {
        "user_stories": len(user_story_payloads),
        "resources": len(resource_payloads),
        "sprint_plan_rows": len(sprint_plan_payloads),
    }
    print(
        f"\n[SHEET IMPORT] upload={file_upload.id} "
        f"user_stories={counts['user_stories']} "
        f"resources={counts['resources']} "
        f"sprint_plan_rows={counts['sprint_plan_rows']}"
    )
    return counts
