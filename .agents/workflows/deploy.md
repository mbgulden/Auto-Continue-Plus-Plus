---
description: Build, package, and publish the Auto-Continue Plus Plus extension
---
# Extension Deployment Workflow

This workflow automates the process of bumping the version, optimizing the build, committing to GitHub, and publishing to both the VS Code Marketplace and Open VSX Registry. We use unified npm scripts to manage this process cross-platform.

## Prerequisites
Ensure your authorization tokens from `.agents/knowledge/keys.md` are exported to your environment before running this!

If running from bash/zsh:
```bash
export VSCE_PAT="<azure_devops_pat>"
export OVSX_PAT="<open_vsx_pat>"
```

If running from PowerShell:
```powershell
$env:VSCE_PAT="<azure_devops_pat>"
$env:OVSX_PAT="<open_vsx_pat>"
```

## Options

### Option 1: The One-Click Deploy (Recommended)
This will clean, build, compile the package, commit to github, and publish to both registries in one go.

// turbo-all
```bash
npm run deploy
```

---

### Option 2: Step-by-Step Deployment

**1. Bump Version**
Bump the version in `package.json` before building to ensure the new version is compiled into the extension metadata.
```bash
npm run version:patch
```

**2. Verify Workspace Cleanliness & Build Output**
Run the package command to verify the `.vsix` compiles and see the file size.
```bash
npm run package
```

**3. Publish to VS Code Marketplace**
Deploys directly to the Microsoft extension gallery.
```bash
npm run publish:vsce -p $env:VSCE_PAT
```

**4. Publish to Open VSX Registry**
Deploys to the open-source registry used by VSCodium and other editors.
```bash
npm run publish:ovsx -p $env:OVSX_PAT
```
