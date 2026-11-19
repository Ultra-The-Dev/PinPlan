import AppHeader from "@/components/AppHeader";
import ProductsEditor from "@/components/ProductsEditor";
import RoleGate from "@/components/RoleGate";

export default function ProductsPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <RoleGate action="editCatalog" what="The product list">
          <ProductsEditor />
        </RoleGate>
      </main>
    </>
  );
}
