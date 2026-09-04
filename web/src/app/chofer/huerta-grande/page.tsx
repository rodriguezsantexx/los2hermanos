import RoleGuard from "@/components/auth/RoleGuard";
import DriverOrders from "@/components/dashboard/DriverOrders";

export default function ChoferHuertaGrandePage() {
  return <RoleGuard allowedRole="CHOFER_HUERTA_GRANDE"><DriverOrders localidad="Huerta Grande" /></RoleGuard>;
}
