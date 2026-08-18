import RoleGuard from "@/components/auth/RoleGuard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";

export default function AdminDashboardPage() {
  return (
    <RoleGuard allowedRole="ADMIN">
      <AdminDashboard />
    </RoleGuard>
  );
}
