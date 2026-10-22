# Application Review

A local CSV review workspace built with React, TypeScript, and Vite. Import applications, read their answers, record decisions and reasons, and export an updated CSV.

## Run

Requires Node.js 22.12 or newer and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173 and choose **Import CSV**. A fresh checkout starts empty. The app runs on your computer, and imported applications and saved reviews are stored in `data/workspace.json`. No hosted service or account is needed.

## CSV format

Import a UTF-8 CSV with a header row. The following column names are recognized:

| Column | Meaning |
| --- | --- |
| `Submission ID` | Required, unique and nonempty for each application |
| `Primary Contact Information` | Required column containing the applicant's name |
| `Reviewer` | Reviewer name; may be blank |
| `Accept/Reject` | `Accept`, `Reject`, `Borderline`, or blank |
| `Reason` | Decision reason / review notes; may be blank |
| `Primary benchmark category` | Category shown in the queue and filters |
| `Benchmark topic` | Proposal summary shown in the queue |

The proposal tab shows `Benchmark topic`, `Impact on jobs`, `Impact on AI timelines`, `Societal relatability`, `Safety`, `Other`, `Tasks involved`, and `Scoring process`. The experience tab shows the hardware, learning, simulation, evaluation, and optional experience answers. Other imported columns remain available under **All fields** and in exports. Missing optional fields are supported. `Standards review` is discarded during import.

Quoted commas, quotes, and multiline answers are supported. For example, this entirely fictional CSV can be saved to a file and imported:

```csv
Reviewer,Accept/Reject,Reason,Submission ID,Primary Contact Information,Primary benchmark category,Benchmark topic
Demo reviewer,Borderline,Ask for scoring details,demo-1,Example Applicant,Safety,Safe drawer closure
```

## Reviewing and importing

- Search answers and review notes; filter by decision, category, or reviewer.
- Choose Accept, Reject, or Borderline. A decision also saves the reviewer and notes. Use **Save review** for notes-only edits and **Undo** to revert the most recent save.
- Unsaved drafts survive navigation within the page. Save them before importing or exporting; drafts do not survive closing the app.
- Import replaces the active dataset and its reviews with the contents of the new CSV. Before replacement, the previous saved workspace is copied to `data/backups/`. Invalid imports leave the current workspace intact.
- **Export reviews** downloads every application, including those hidden by filters. It updates `Reviewer`, `Accept/Reject`, and `Reason`, preserving other columns and answers. Values starting with spreadsheet formula characters are prefixed with an apostrophe for safe opening in spreadsheet apps.

To restore a backup, stop the server, copy the chosen backup JSON over `data/workspace.json`, and restart it. Keep a separate backup of `data/` for protection against disk loss.

## Development

```sh
pnpm test
pnpm build
```

Tests use fictional fixtures only. Build includes TypeScript checking. The review API is a local Vite development-server plugin; the generated `dist/` folder alone does not provide persistence or import APIs. Run `pnpm dev` to use the full app. The server binds to loopback by default.

Imported data, local backups, CSV files, and environment files are ignored by Git. The repository contains no applicant dataset or preset decisions.

## License

Copyright (C) 2026 Application Review contributors.

Licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`). See [LICENSE](LICENSE) for the full terms. This program comes without warranty.
