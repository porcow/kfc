## 1. Uninstall cleanup flow

- [x] 1.1 Update `kfc service uninstall` to load the installed config and enumerate every configured bot-scoped cronjob launchd label and plist path
- [x] 1.2 Unload each configured cronjob from launchd and remove its plist file before removing the main service plist
- [x] 1.3 Aggregate and surface cronjob cleanup failures while still attempting cleanup for the remaining configured cronjobs

## 2. Verification and operator tooling

- [x] 2.1 Add tests for successful uninstall cleanup across multiple cronjobs and for partial cronjob unload failures
- [x] 2.2 Update uninstall fallback behavior and operator documentation so “service uninstall” clearly covers the main service plus all configured cronjobs
