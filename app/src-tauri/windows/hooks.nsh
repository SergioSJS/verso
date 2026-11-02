; This Source Code Form is subject to the terms of the Mozilla Public
; License, v. 2.0. If a copy of the MPL was not distributed with this
; file, You can obtain one at https://mozilla.org/MPL/2.0/.
;
; Verso as an app for .md and .markdown on Windows (ADR 0114 item 3, Q6),
; and for .json, .yaml, .yml, .toml, .xml and .csv, which open in the
; diagram (item 31, amended 2026-10-31): what Tauri's own
; `fileAssociations` would not do right — it writes each extension key's
; default value, taking the default where none was chosen, under an
; unversioned class name. Here, under SHCTX (the current-user hive for the
; per-user install, the machine's for an all-users one): a versioned ProgID
; per kind of file with a quoted "%1"; `OpenWithProgids` on every
; extension, so Verso is offered under "Open with"; `Capabilities` and
; `RegisteredApplications`, so Settings > Default apps lists it. No
; extension key's default value is ever written: the choice of default is
; the person's (Microsoft, "Default Programs"). The uninstaller removes
; exactly these keys. `scripts/check-file-associations.mjs` reads this file.

; One ProgID per kind of file and per channel: the beta and the release
; install side by side (ADR 0051) and must not share a class; a JSON file
; is not named a "Markdown document" where the person makes Verso its app.
!if "${BUNDLEID}" == "com.versomd.app.beta"
  !define VERSO_PROGID "Verso.Markdown.Beta.1"
  !define VERSO_PROGID_JSON "Verso.Json.Beta.1"
  !define VERSO_PROGID_YAML "Verso.Yaml.Beta.1"
  !define VERSO_PROGID_TOML "Verso.Toml.Beta.1"
  !define VERSO_PROGID_XML "Verso.Xml.Beta.1"
  !define VERSO_PROGID_CSV "Verso.Csv.Beta.1"
  !define VERSO_REG_APP "VersoBeta"
!else
  !define VERSO_PROGID "Verso.Markdown.1"
  !define VERSO_PROGID_JSON "Verso.Json.1"
  !define VERSO_PROGID_YAML "Verso.Yaml.1"
  !define VERSO_PROGID_TOML "Verso.Toml.1"
  !define VERSO_PROGID_XML "Verso.Xml.1"
  !define VERSO_PROGID_CSV "Verso.Csv.1"
  !define VERSO_REG_APP "Verso"
!endif

!macro NSIS_HOOK_POSTINSTALL
  ; Markdown (item 3).
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}" "" "Markdown document"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}" "FriendlyTypeName" "Markdown document"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.md\OpenWithProgids" "${VERSO_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\.markdown\OpenWithProgids" "${VERSO_PROGID}" ""
  ; The structured-data files the diagram reads (item 31).
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_JSON}" "" "JSON file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_JSON}" "FriendlyTypeName" "JSON file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_JSON}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_JSON}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_JSON}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.json\OpenWithProgids" "${VERSO_PROGID_JSON}" ""
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_YAML}" "" "YAML file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_YAML}" "FriendlyTypeName" "YAML file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_YAML}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_YAML}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_YAML}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.yaml\OpenWithProgids" "${VERSO_PROGID_YAML}" ""
  WriteRegStr SHCTX "Software\Classes\.yml\OpenWithProgids" "${VERSO_PROGID_YAML}" ""
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_TOML}" "" "TOML file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_TOML}" "FriendlyTypeName" "TOML file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_TOML}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_TOML}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_TOML}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.toml\OpenWithProgids" "${VERSO_PROGID_TOML}" ""
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_XML}" "" "XML file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_XML}" "FriendlyTypeName" "XML file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_XML}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_XML}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_XML}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.xml\OpenWithProgids" "${VERSO_PROGID_XML}" ""
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_CSV}" "" "CSV file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_CSV}" "FriendlyTypeName" "CSV file"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_CSV}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_CSV}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${VERSO_PROGID_CSV}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.csv\OpenWithProgids" "${VERSO_PROGID_CSV}" ""
  ; Settings > Default apps.
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities" "ApplicationDescription" "Notes in Markdown, in plain files you own"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".md" "${VERSO_PROGID}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".markdown" "${VERSO_PROGID}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".json" "${VERSO_PROGID_JSON}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".yaml" "${VERSO_PROGID_YAML}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".yml" "${VERSO_PROGID_YAML}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".toml" "${VERSO_PROGID_TOML}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".xml" "${VERSO_PROGID_XML}"
  WriteRegStr SHCTX "Software\${VERSO_REG_APP}\Capabilities\FileAssociations" ".csv" "${VERSO_PROGID_CSV}"
  WriteRegStr SHCTX "Software\RegisteredApplications" "${VERSO_REG_APP}" "Software\${VERSO_REG_APP}\Capabilities"
  ; The shell learns the associations changed (SHCNE_ASSOCCHANGED).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue SHCTX "Software\Classes\.md\OpenWithProgids" "${VERSO_PROGID}"
  DeleteRegValue SHCTX "Software\Classes\.markdown\OpenWithProgids" "${VERSO_PROGID}"
  DeleteRegValue SHCTX "Software\Classes\.json\OpenWithProgids" "${VERSO_PROGID_JSON}"
  DeleteRegValue SHCTX "Software\Classes\.yaml\OpenWithProgids" "${VERSO_PROGID_YAML}"
  DeleteRegValue SHCTX "Software\Classes\.yml\OpenWithProgids" "${VERSO_PROGID_YAML}"
  DeleteRegValue SHCTX "Software\Classes\.toml\OpenWithProgids" "${VERSO_PROGID_TOML}"
  DeleteRegValue SHCTX "Software\Classes\.xml\OpenWithProgids" "${VERSO_PROGID_XML}"
  DeleteRegValue SHCTX "Software\Classes\.csv\OpenWithProgids" "${VERSO_PROGID_CSV}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID_JSON}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID_YAML}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID_TOML}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID_XML}"
  DeleteRegKey SHCTX "Software\Classes\${VERSO_PROGID_CSV}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "${VERSO_REG_APP}"
  DeleteRegKey SHCTX "Software\${VERSO_REG_APP}\Capabilities"
  DeleteRegKey /ifempty SHCTX "Software\${VERSO_REG_APP}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
