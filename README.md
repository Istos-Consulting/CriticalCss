# Critical CSS reusable workflow

This repository contains the versioned GitHub Actions generation runtime used
by the CriticalCss MODX Extra.

Client repositories contain a small caller workflow:

```yaml
jobs:
  generate:
    uses: Istos-Consulting/CriticalCss/.github/workflows/generate.yml@v0.1.4
    with:
      connector_url: ${{ inputs.connector_url }}
      css_path: ${{ inputs.css_path }}
      queue_updated_at: ${{ inputs.queue_updated_at }}
    secrets:
      api_token: ${{ secrets.CRITICALCSS_API_TOKEN }}
```

The central workflow checks out the calling repository for its persisted
`assets/css/critical/critical-manifest.json` and checks out its own scripts from
the exact reusable-workflow commit. It reads ID/URL work from the authenticated
MODX connector, generates mobile and desktop Critical CSS, returns generated
CSS to MODX, and commits comparison state to the client repository.

## Release

Client callers must reference an existing immutable version tag. Publish the
central workflow and scripts before creating the corresponding tag:

```bash
git tag v0.1.4
git push origin v0.1.4
```

Do not store site CSS, generated Critical CSS, API tokens, or client comparison
manifests in this central repository.
