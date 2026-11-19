import AppHeader from "@/components/AppHeader";
import CatalogEditor from "@/components/CatalogEditor";
import RoleGate from "@/components/RoleGate";

export default function CatalogPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <RoleGate action="editCatalog" what="The device catalog">
          <CatalogEditor />
        </RoleGate>
      </main>
    </>
  );
}
