import AppHeader from "@/components/AppHeader";
import CatalogEditor from "@/components/CatalogEditor";

export default function CatalogPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <CatalogEditor />
      </main>
    </>
  );
}
