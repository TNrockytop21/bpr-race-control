using System;
using System.Reflection;
class Program {
    static void Main() {
        var asm = Assembly.LoadFrom(@"C:\Program Files (x86)\SimHub\GameReaderCommon.dll");
        var t = asm.GetType("GameReaderCommon.Opponent");
        if (t == null) { Console.WriteLine("Type not found"); return; }
        Console.WriteLine("=== Properties ===");
        foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            Console.WriteLine(p.PropertyType.Name + " " + p.Name);
    }
}
