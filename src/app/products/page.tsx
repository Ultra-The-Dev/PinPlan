import AppHeader from "@/components/AppHeader";
import ProductsEditor from "@/components/ProductsEditor";

export default function ProductsPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <ProductsEditor />
      </main>
    </>
  );
}
