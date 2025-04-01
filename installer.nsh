!macro customHeader
  !include LogicLib.nsh
  !include FileFunc.nsh
  
  ; Import required functions
  ${GetParameters}
  ${GetOptions}
  
  ; Define our command line parameters
  !define PARAM_IT "--it"
  
  ; Variable to track if IT mode is enabled
  Var ITMode
  
  ; Define custom function for directory page
  !define MUI_PAGE_CUSTOMFUNCTION_PRE directoryPagePre
  
  ; Function to check if directory page should be shown
  Function directoryPagePre
    ${If} $ITMode == "0"
      ; Skip to the next page if not in IT mode
      Abort
    ${EndIf}
  FunctionEnd
!macroend

!macro customInit
  ; Function to check command line parameters
  ; Initialize ITMode to 0 (false)
  StrCpy $ITMode "0"
  
  ; Get command line parameters
  ${GetParameters} $R0
  
  ; Check if --it parameter is present
  ${GetOptions} $R0 "${PARAM_IT}" $R1
  ${IfNot} ${Errors}
    ; Set ITMode to 1 (true) if --it parameter is found
    StrCpy $ITMode "1"
    MessageBox MB_OK "IT Mode enabled. You can customize the installation directory."
  ${EndIf}
!macroend

!macro customInstall
  ; Custom installation steps can be added here if needed
!macroend
