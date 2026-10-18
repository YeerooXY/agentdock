param([Parameter(Mandatory=$true)][long]$WindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DockWindowDetails {
  [StructLayout(LayoutKind.Sequential)] public struct Key { public Guid format; public uint id; }
  [StructLayout(LayoutKind.Explicit, Size=24)] public struct Value { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr text; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface Store {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out Key key);
    [PreserveSig] int GetValue(ref Key key, out Value value);
    [PreserveSig] int SetValue(ref Key key, ref Value value);
    [PreserveSig] int Commit();
  }
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, out Store store);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref Value value);
  public static string Read(IntPtr window, uint id) {
    Guid iid = typeof(Store).GUID; Store store;
    Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window, ref iid, out store));
    try {
      Key key = new Key { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id = id }; Value value;
      Marshal.ThrowExceptionForHR(store.GetValue(ref key, out value));
      try { return value.type == 31 ? Marshal.PtrToStringUni(value.text) : null; } finally { PropVariantClear(ref value); }
    } finally { Marshal.ReleaseComObject(store); }
  }
}
'@
[ordered]@{
  appId = [DockWindowDetails]::Read([IntPtr]$WindowHandle,5)
  icon = [DockWindowDetails]::Read([IntPtr]$WindowHandle,3)
  command = [DockWindowDetails]::Read([IntPtr]$WindowHandle,2)
  displayName = [DockWindowDetails]::Read([IntPtr]$WindowHandle,4)
} | ConvertTo-Json
