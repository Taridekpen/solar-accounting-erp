import { navigation } from "@/app/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function ModulePlaceholderPage({ path }: { path: string }) {
  const item = navigation.find((entry) => entry.to === path);
  const title = item?.label ?? "Module";

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: title }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <Card>
        <EmptyState
          icon={item?.icon}
          title={`${title} is not available yet`}
          description={`${title} is implemented in ${item?.section ?? "a later section"}. No records are loaded on this screen.`}
        />
      </Card>
    </div>
  );
}
