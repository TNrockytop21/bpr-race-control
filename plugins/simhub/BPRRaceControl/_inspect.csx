using System.Reflection;
var asm = Assembly.LoadFrom(@"C:\Program Files (x86)\SimHub\GameReaderCommon.dll");
var t = asm.GetType("GameReaderCommon.Opponent");
if (t != null) {
    foreach (var p in t.GetProperties()) {
        Console.WriteLine($"{p.PropertyType.Name} {p.Name}");
    }
}
