; This Source Code Form is subject to the terms of the Mozilla Public
; License, v. 2.0. If a copy of the MPL was not distributed with this
; file, You can obtain one at https://mozilla.org/MPL/2.0/.
;
; Verso as an app for .md and .markdown on Windows (ADR 0114 item 3, Q6):
; what Tauri's own `fileAssociations` would not do right — it writes the
; `.md` key's default value, taking the default where none was chosen,
; under an unversioned class name. Here, under SHCTX (the current-user
; hive for the per-user install, the machine's for an all-users one):
; a versioned ProgID with a quoted "%1"; `OpenWithProgids` on both
; extensions, so Verso is offered under "Open with"; `Capabilities` and
; `RegisteredApplications`, so Settings > Default apps lists it. The `.md`
; key's default value is never written: the choice of default is the
; person's (Microsoft, "Default Programs"). The uninstaller removes exactly
; these keys. `scripts/check-file-associations.mjs` reads this file.

; One ProgID per channel: the beta and the release install side by side
; (ADR 0051) and must not share a class.
!if "${BUNDLEID}" == "com.versomd.app.beta"
  !define VERSO_PROGID "Verso.Markdown.Beta.1"
  !define VERSO_REG_APP "VersoBeta"
!else
  !define VERSO_PROGID "Verso.Markdown.1"
  !define VERSO_REG_APP "Verso"
!endif

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}" "" "Markdown document"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}" "FriendlyTypeName" "Markdown document"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.md\OpenWithProgids" "${VERSO_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\.markdown\OpenWithProgids" "${VERSO_PROGID}" ""
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities" "ApplicationDescription" "Notes in Markdown, in plain files you own"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".md" "${VERSO_PROGID}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".markdown" "${VERSO_PROGID}"
  WriteRegStr SHCTX "Software\RegisteredApplications" "${VERSO_REG_APP}" "Software\${VERSO_REG_APP}\Capabilities"
  ; The shell learns the associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue SHCTX "Software\Classes\.md\OpenWithProgids" "${VERSO_PROGID}"
  DeleteRegValue SHCTX "Software\Classes\.markdown\OpenWithProgids" "${VERSO_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "${VERSO_REG_APP}"
  DeleteRegKey SHCTX "Software\${VERSO_REG_APP}\Capabilities"
  DeleteRegKey /ifempty SHCTX "Software\${VERSO_REG_APP}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
