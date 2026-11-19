// GENERATED from src/lib/forms/builtins.ts by tests/formsSwift.test.ts — do not edit by hand.
// Regenerate: UPDATE_SWIFT=1 npx vitest run tests/formsSwift.test.ts
// swiftlint:disable all

let formBuiltinsJSON = #"""
[
  {
    "id": "rough_in_request",
    "name": "Rough-in inspection request",
    "category": "inspection",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "h_request",
        "type": "heading",
        "label": "Request"
      },
      {
        "id": "inspection_type",
        "type": "select",
        "label": "Inspection",
        "required": true,
        "options": [
          "Electrical rough-in",
          "Low voltage rough-in",
          "Fire alarm rough-in",
          "Mechanical rough-in",
          "Plumbing rough-in",
          "Other"
        ]
      },
      {
        "id": "permit",
        "type": "text",
        "label": "Permit number"
      },
      {
        "id": "date_wanted",
        "type": "date",
        "label": "Date wanted",
        "required": true
      },
      {
        "id": "window",
        "type": "select",
        "label": "Time",
        "options": [
          "Morning",
          "Afternoon",
          "Any time"
        ]
      },
      {
        "id": "contact",
        "type": "text",
        "label": "Site contact (name and phone)",
        "required": true
      },
      {
        "id": "h_ready",
        "type": "heading",
        "label": "Ready for inspection"
      },
      {
        "id": "work_complete",
        "type": "yesno",
        "label": "Rough-in work complete in the areas to inspect",
        "required": true
      },
      {
        "id": "boxes_secured",
        "type": "yesno",
        "label": "Boxes, supports and cables secured",
        "required": true
      },
      {
        "id": "labeled",
        "type": "yesno",
        "label": "Cables and circuits identified",
        "required": true
      },
      {
        "id": "access",
        "type": "yesno",
        "label": "Inspector has access (keys, lockbox, ladder)"
      },
      {
        "id": "notes",
        "type": "longtext",
        "label": "Notes for the inspector"
      },
      {
        "id": "photos",
        "type": "photo",
        "label": "Photos"
      },
      {
        "id": "sig_requested",
        "type": "signature",
        "label": "Requested by",
        "required": true
      }
    ]
  },
  {
    "id": "lv_cable_test",
    "name": "Low-voltage cable test record",
    "trade": "lowvoltage",
    "category": "test",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "test_date",
        "type": "date",
        "label": "Test date",
        "required": true
      },
      {
        "id": "tester",
        "type": "text",
        "label": "Tester make / model"
      },
      {
        "id": "cables",
        "type": "table",
        "label": "Cables",
        "required": true,
        "columns": [
          {
            "id": "label",
            "type": "text",
            "label": "Label",
            "required": true
          },
          {
            "id": "cable_type",
            "type": "select",
            "label": "Cable type",
            "options": [
              "Cat6",
              "Cat6A",
              "Cat5e",
              "RG6 coax",
              "Fiber",
              "Speaker wire",
              "Other"
            ]
          },
          {
            "id": "length",
            "type": "number",
            "label": "Length",
            "unit": "ft",
            "min": 0
          },
          {
            "id": "pass",
            "type": "yesno",
            "label": "Pass",
            "required": true
          },
          {
            "id": "notes",
            "type": "text",
            "label": "Notes"
          }
        ]
      },
      {
        "id": "failures",
        "type": "calc",
        "label": "Failed cables",
        "calc": {
          "op": "count_no",
          "of": "cables.pass"
        }
      },
      {
        "id": "total_length",
        "type": "calc",
        "label": "Total length",
        "unit": "ft",
        "calc": {
          "op": "sum",
          "of": "cables.length"
        }
      },
      {
        "id": "photos",
        "type": "photo",
        "label": "Tester screenshots / photos"
      },
      {
        "id": "sig_tech",
        "type": "signature",
        "label": "Tested by",
        "required": true
      }
    ]
  },
  {
    "id": "fa_device_test",
    "name": "Fire alarm device test",
    "trade": "fire",
    "category": "test",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "test_date",
        "type": "date",
        "label": "Test date",
        "required": true
      },
      {
        "id": "panel",
        "type": "text",
        "label": "Panel (make / model / location)"
      },
      {
        "id": "central_station",
        "type": "yesno",
        "label": "Central station notified before testing"
      },
      {
        "id": "devices",
        "type": "table",
        "label": "Devices",
        "required": true,
        "columns": [
          {
            "id": "label",
            "type": "text",
            "label": "Device label",
            "required": true
          },
          {
            "id": "device_type",
            "type": "select",
            "label": "Type",
            "options": [
              "Smoke",
              "Heat",
              "Pull station",
              "Horn / strobe",
              "Duct detector",
              "Waterflow / tamper",
              "Other"
            ]
          },
          {
            "id": "location",
            "type": "text",
            "label": "Location"
          },
          {
            "id": "pass",
            "type": "yesno",
            "label": "Test pass",
            "required": true
          }
        ]
      },
      {
        "id": "failures",
        "type": "calc",
        "label": "Devices that failed",
        "calc": {
          "op": "count_no",
          "of": "devices.pass"
        }
      },
      {
        "id": "restored",
        "type": "yesno",
        "label": "System back to normal and central station told"
      },
      {
        "id": "notes",
        "type": "longtext",
        "label": "Notes"
      },
      {
        "id": "sig_tech",
        "type": "signature",
        "label": "Tested by",
        "required": true
      },
      {
        "id": "sig_witness",
        "type": "signature",
        "label": "Witness (owner / AHJ)"
      }
    ]
  },
  {
    "id": "panel_inspection",
    "name": "Electrical panel inspection",
    "trade": "electrical",
    "category": "inspection",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "panel",
        "type": "text",
        "label": "Panel name / location",
        "required": true
      },
      {
        "id": "date",
        "type": "date",
        "label": "Date",
        "required": true
      },
      {
        "id": "h_visual",
        "type": "heading",
        "label": "Visual check"
      },
      {
        "id": "cover",
        "type": "yesno",
        "label": "Cover and dead front in place",
        "required": true
      },
      {
        "id": "directory",
        "type": "yesno",
        "label": "Circuit directory filled in",
        "required": true
      },
      {
        "id": "grounding",
        "type": "yesno",
        "label": "Grounding and bonding in place",
        "required": true
      },
      {
        "id": "no_double_taps",
        "type": "yesno",
        "label": "No double-tapped breakers",
        "required": true
      },
      {
        "id": "clearance",
        "type": "yesno",
        "label": "Working clearance kept clear",
        "required": true
      },
      {
        "id": "torque",
        "type": "yesno",
        "label": "Terminations torqued",
        "required": true
      },
      {
        "id": "h_megger",
        "type": "heading",
        "label": "Insulation resistance (megger)"
      },
      {
        "id": "test_voltage",
        "type": "select",
        "label": "Test voltage",
        "options": [
          "250 V",
          "500 V",
          "1000 V"
        ]
      },
      {
        "id": "ir_l1",
        "type": "number",
        "label": "L1 to ground",
        "unit": "MΩ",
        "min": 0
      },
      {
        "id": "ir_l2",
        "type": "number",
        "label": "L2 to ground",
        "unit": "MΩ",
        "min": 0
      },
      {
        "id": "ir_l3",
        "type": "number",
        "label": "L3 to ground",
        "unit": "MΩ",
        "min": 0
      },
      {
        "id": "ir_n",
        "type": "number",
        "label": "Neutral to ground",
        "unit": "MΩ",
        "min": 0
      },
      {
        "id": "notes",
        "type": "longtext",
        "label": "Notes"
      },
      {
        "id": "photos",
        "type": "photo",
        "label": "Photos"
      },
      {
        "id": "sig_inspector",
        "type": "signature",
        "label": "Inspected by",
        "required": true
      }
    ]
  },
  {
    "id": "jha",
    "name": "Job site safety / JHA",
    "category": "safety",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "date",
        "type": "date",
        "label": "Date",
        "required": true
      },
      {
        "id": "task",
        "type": "longtext",
        "label": "Work planned today",
        "required": true
      },
      {
        "id": "hazards",
        "type": "multiselect",
        "label": "Hazards",
        "options": [
          "Ladders / working at height",
          "Live electrical",
          "Power tools",
          "Overhead work",
          "Confined space",
          "Hot work",
          "Dust / silica",
          "Traffic / vehicles",
          "Weather"
        ]
      },
      {
        "id": "ppe",
        "type": "multiselect",
        "label": "PPE needed",
        "options": [
          "Hard hat",
          "Safety glasses",
          "Gloves",
          "Hearing protection",
          "Hi-vis vest",
          "Harness",
          "Respirator / mask",
          "Arc-rated clothing"
        ]
      },
      {
        "id": "controls",
        "type": "longtext",
        "label": "How we'll control the hazards"
      },
      {
        "id": "briefed",
        "type": "yesno",
        "label": "Crew briefed on the hazards",
        "required": true
      },
      {
        "id": "lockout",
        "type": "yesno",
        "label": "Lockout / tagout in place where needed"
      },
      {
        "id": "first_aid",
        "type": "yesno",
        "label": "First aid kit and extinguisher on site",
        "required": true
      },
      {
        "id": "crew",
        "type": "table",
        "label": "Crew present",
        "columns": [
          {
            "id": "name",
            "type": "text",
            "label": "Name",
            "required": true
          }
        ]
      },
      {
        "id": "sig_lead",
        "type": "signature",
        "label": "Crew lead",
        "required": true
      }
    ]
  },
  {
    "id": "tm_tag",
    "name": "T&M tag",
    "category": "tm",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "date",
        "type": "date",
        "label": "Date of work",
        "required": true
      },
      {
        "id": "requested_by",
        "type": "text",
        "label": "Requested by (customer / GC)"
      },
      {
        "id": "description",
        "type": "longtext",
        "label": "Extra work done",
        "required": true,
        "help": "What was asked for and what was done, in plain words."
      },
      {
        "id": "labor",
        "type": "table",
        "label": "Labor",
        "required": true,
        "columns": [
          {
            "id": "name",
            "type": "text",
            "label": "Name",
            "required": true
          },
          {
            "id": "hours",
            "type": "number",
            "label": "Hours",
            "unit": "hrs",
            "required": true,
            "min": 0,
            "max": 24
          }
        ]
      },
      {
        "id": "total_hours",
        "type": "calc",
        "label": "Total hours",
        "unit": "hrs",
        "calc": {
          "op": "sum",
          "of": "labor.hours"
        }
      },
      {
        "id": "materials",
        "type": "table",
        "label": "Materials",
        "columns": [
          {
            "id": "item",
            "type": "text",
            "label": "Item",
            "required": true
          },
          {
            "id": "qty",
            "type": "number",
            "label": "Qty",
            "required": true,
            "min": 0
          }
        ]
      },
      {
        "id": "total_materials",
        "type": "calc",
        "label": "Material items",
        "calc": {
          "op": "sum",
          "of": "materials.qty"
        }
      },
      {
        "id": "photos",
        "type": "photo",
        "label": "Photos"
      },
      {
        "id": "sig_customer",
        "type": "signature",
        "label": "Customer signature",
        "required": true,
        "help": "Agrees the work above was done."
      },
      {
        "id": "sig_ours",
        "type": "signature",
        "label": "Our signature",
        "required": true
      }
    ]
  },
  {
    "id": "walkthrough",
    "name": "Customer walkthrough / sign-off",
    "category": "other",
    "version": 1,
    "builtin": true,
    "fields": [
      {
        "id": "date",
        "type": "date",
        "label": "Date",
        "required": true
      },
      {
        "id": "customer",
        "type": "text",
        "label": "Customer",
        "required": true
      },
      {
        "id": "walked",
        "type": "yesno",
        "label": "Work walked through with the customer",
        "required": true
      },
      {
        "id": "trained",
        "type": "yesno",
        "label": "Customer shown how to use what we installed",
        "required": true
      },
      {
        "id": "docs",
        "type": "yesno",
        "label": "Manuals, logins and warranty info handed over"
      },
      {
        "id": "clean",
        "type": "yesno",
        "label": "Site left clean",
        "required": true
      },
      {
        "id": "open_items",
        "type": "longtext",
        "label": "Open items",
        "help": "Anything still to do. Leave blank if none."
      },
      {
        "id": "photos",
        "type": "photo",
        "label": "Photos"
      },
      {
        "id": "sig_customer",
        "type": "signature",
        "label": "Customer signature",
        "required": true
      },
      {
        "id": "sig_ours",
        "type": "signature",
        "label": "Our signature"
      }
    ]
  }
]
"""#
