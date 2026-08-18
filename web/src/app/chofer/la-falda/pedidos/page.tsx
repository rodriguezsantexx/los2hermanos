import RoleGuard from "@/components/auth/RoleGuard";
import DriverOrders from "@/components/dashboard/DriverOrders";

export default function ChoferLaFaldaOrdersPage() {
  return <RoleGuard allowedRole="CHOFER_LA_FALDA"><DriverOrders localidad="La Falda" /></RoleGuard>;
}
