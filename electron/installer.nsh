; ============================================================
; 自定义卸载页：是否保留用户游玩数据
; 默认勾选（保留），取消勾选则删除 %APPDATA%\yingguangjiyou
; ============================================================

Var KeepUserData          ; 1=保留, 0=删除
Var KeepDataCheckboxHwnd  ; 复选框句柄

; 安装阶段直接跳过本页（仅卸载时显示）
Function KeepDataPage
  Abort
FunctionEnd

; 卸载时显示的自定义页面
Function un.KeepDataPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "卸载选项"
  Pop $0

  ${NSD_CreateCheckbox} 0 22u 100% 40u "保留用户游玩数据（存档、设置、昵称等）$\r$\n取消勾选将删除全部游玩数据且不可恢复"
  Pop $KeepDataCheckboxHwnd
  ${NSD_SetState} $KeepDataCheckboxHwnd ${BST_CHECKED}
  StrCpy $KeepUserData 1

  nsDialogs::Show
FunctionEnd

; 离开页面时读取勾选状态
Function un.KeepDataPageLeave
  ${NSD_GetState} $KeepDataCheckboxHwnd $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $KeepUserData 1
  ${Else}
    StrCpy $KeepUserData 0
  ${EndIf}
FunctionEnd

; 注册自定义页面（安装时由 KeepDataPage 跳过，卸载时显示 un.KeepDataPage）
Page custom KeepDataPage un.KeepDataPageLeave

; 卸载执行阶段：根据勾选决定是否删除用户数据
!macro customUnInstall
  ${If} $KeepUserData == 0
    RMDir /r "$APPDATA\yingguangjiyou"
  ${EndIf}
!macroend
