import os
import json
from datetime import datetime, timezone
import sys
from pathlib import Path

# Agregar raíz de backend al path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from database.connection import supabase

TABLAS_CRITICAS = [
    "roles",
    "usuarios",
    "localidades",
    "clientes",
    "productos",
    "pedidos",
    "detalle_pedidos",
    "movimientos_stock",
    "movimientos_caja",
    "pagos",
    "whatsapp_chats",
    "whatsapp_mensajes",
]

def realizar_backup():
    print("=" * 60)
    print("Iniciando copia de seguridad de la base de datos Supabase...")
    print("=" * 60)

    # Carpeta de destino (a nivel raíz del proyecto)
    root_dir = backend_dir.parent
    backups_dir = root_dir / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = backups_dir / f"supabase_backup_{timestamp}.json"

    data_dump = {
        "metadata": {
            "fecha_utc": datetime.now(timezone.utc).isoformat(),
            "tablas_incluidas": TABLAS_CRITICAS
        },
        "tables": {}
    }

    total_registros = 0

    for tabla in TABLAS_CRITICAS:
        try:
            res = supabase.table(tabla).select("*").execute()
            filas = res.data or []
            data_dump["tables"][tabla] = filas
            count = len(filas)
            total_registros += count
            print(f"  ✓ Tabla '{tabla}': {count} registros respaldados.")
        except Exception as e:
            print(f"  ✗ Error leyendo tabla '{tabla}': {e}")
            data_dump["tables"][tabla] = {"error": str(e)}

    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(data_dump, f, ensure_ascii=False, indent=2)

    tamano_kb = round(backup_file.stat().st_size / 1024, 2)
    print("=" * 60)
    print(f"✅ Backup completado exitosamente:")
    print(f"   Archivo: {backup_file}")
    print(f"   Total registros: {total_registros}")
    print(f"   Tamaño: {tamano_kb} KB")
    print("=" * 60)

if __name__ == "__main__":
    realizar_backup()
