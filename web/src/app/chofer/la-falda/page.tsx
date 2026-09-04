import RoleGuard from "@/components/auth/RoleGuard";
import DriverOrders from "@/components/dashboard/DriverOrders";

export default function ChoferLaFaldaPage() {
  return <RoleGuard allowedRole="CHOFER_LA_FALDA"><DriverOrders localidad="La Falda" /></RoleGuard>;
}
