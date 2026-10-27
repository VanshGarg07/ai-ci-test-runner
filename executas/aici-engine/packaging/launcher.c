/* aici-engine.exe: tiny Windows launcher. Runs node\node.exe app\index.js with
   PLAYWRIGHT_BROWSERS_PATH set, passing stdin/stdout/stderr straight through. */
#include <windows.h>
#include <wchar.h>

int wmain(int argc, wchar_t **argv) {
  static wchar_t self[32768], browsers[32768], cmd[32768];
  DWORD n = GetModuleFileNameW(NULL, self, 32768);
  if (n == 0 || n >= 32768) return 2;
  wchar_t *slash = wcsrchr(self, L'\\');
  if (slash) *slash = 0;

  swprintf(browsers, 32768, L"%ls\\browsers", self);
  SetEnvironmentVariableW(L"PLAYWRIGHT_BROWSERS_PATH", browsers);

  swprintf(cmd, 32768, L"\"%ls\\node\\node.exe\" \"%ls\\app\\index.js\"", self, self);
  for (int i = 1; i < argc; i++) {
    wcscat(cmd, L" \"");
    wcscat(cmd, argv[i]);
    wcscat(cmd, L"\"");
  }

  STARTUPINFOW si; PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si)); ZeroMemory(&pi, sizeof(pi));
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESTDHANDLES;
  si.hStdInput  = GetStdHandle(STD_INPUT_HANDLE);
  si.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  si.hStdError  = GetStdHandle(STD_ERROR_HANDLE);
  SetHandleInformation(si.hStdInput,  HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
  SetHandleInformation(si.hStdOutput, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
  SetHandleInformation(si.hStdError,  HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);

  if (!CreateProcessW(NULL, cmd, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) return 3;
  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD code = 0;
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
  return (int)code;
}
