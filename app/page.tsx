import ArchiveApp from "@/components/ArchiveApp";
import getArchiveData from "@/lib/getArchiveData";

// ISR: the page is generated on the server and refreshed at most once an hour,
// so the database is not queried on every visit.
export const revalidate = 3600;

export default async function Home() {
  const data = await getArchiveData();

  return <ArchiveApp data={data} />;
}
