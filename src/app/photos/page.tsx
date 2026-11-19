import AppHeader from "@/components/AppHeader";
import JobsViewToggle from "@/components/nav/JobsViewToggle";
import PhotoFeed from "@/components/photos/PhotoFeed";

/** Jobs → Recent photos: every job's photos, newest first. */
export default function PhotosPage() {
  return (
    <>
      <AppHeader />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <JobsViewToggle />
        </div>
        <PhotoFeed />
      </main>
    </>
  );
}
