# Local Hipo SDK Code

This folder contains code copied from [hipo-finance/sdk](https://github.com/hipo-finance/sdk) due to module resolution conflicts between our build configuration (`moduleResolution: "Bundler"`) and the SDK's (`moduleResolution: "Node10"`).

## Attribution
All code in this directory is from the [Hipo Finance SDK](https://github.com/hipo-finance/sdk), consisting of 5 core files for staking functionality. Original license applies.

[Include Hipo's license here]

## Why Copy?
Module resolution conflicts created circular dependency issues that were simpler to resolve by copying these small files rather than implementing complex workarounds.

## Files
- [List the 5 files and their basic purposes]

## Updates
Check original SDK for any updates to these files.