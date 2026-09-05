import RoleGuard from "@/components/auth/RoleGuard";
import DriverHome from "@/components/dashboard/DriverHome";

export default function ChoferLaFaldaPage() {
  return <RoleGuard allowedRole="CHOFER_LA_FALDA"><DriverHome localidad="La Falda" /></RoleGuard>;
}
