# Triage Label Vocabulary

This repo uses the **default triage label set** from the canonical triage workflow.

## Label Mapping

| Triage Role | Label String | Description |
|-------------|--------------|-------------|
| Needs Triage | `needs-triage` | Issues that need initial review and classification |
| Needs Info | `needs-info` | Issues blocked waiting for additional information |
| Ready for Agent | `ready-for-agent` | Issues ready for AI/agent implementation |
| Ready for Human | `ready-for-human` | Issues ready for human developer implementation |
| Won't Fix | `wontfix` | Issues intentionally declined or deprecated |

## Usage

The `triage` skill will:
1. Apply `needs-triage` to new incoming issues
2. Move issues through the pipeline using these labels
3. Filter the triage queue based on these label states

Do not create duplicate labels — use these exact strings.
