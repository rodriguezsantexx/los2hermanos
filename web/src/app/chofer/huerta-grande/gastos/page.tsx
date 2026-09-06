import RoleGuard from "@/components/auth/RoleGuard";
import DriverGastos from "@/components/dashboard/DriverGastos";

export default function ChoferHuertaGrandeGastosPage() {
  return <RoleGuard allowedRole="CHOFER_HUERTA_GRANDE"><DriverGastos localidad="Huerta Grande" /></RoleGuard>;
}