import RoleGuard from "@/components/auth/RoleGuard";
import DriverHome from "@/components/dashboard/DriverHome";

export default function ChoferHuertaGrandePage() {
  return <RoleGuard allowedRole="CHOFER_HUERTA_GRANDE"><DriverHome localidad="Huerta Grande" /></RoleGuard>;
}
