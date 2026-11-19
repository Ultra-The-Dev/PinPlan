import AppHeader from "@/components/AppHeader";
import PhotoFeed from "@/components/photos/PhotoFeed";

export default function PhotosPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <PhotoFeed />
      </main>
    </>
  );
}
