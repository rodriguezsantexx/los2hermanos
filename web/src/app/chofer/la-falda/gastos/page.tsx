import RoleGuard from "@/components/auth/RoleGuard";
import DriverGastos from "@/components/dashboard/DriverGastos";

export default function ChoferLaFaldaGastosPage() {
  return <RoleGuard allowedRole="CHOFER_LA_FALDA"><DriverGastos localidad="La Falda" /></RoleGuard>;
}