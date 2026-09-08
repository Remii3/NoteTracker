import { StatisticsPage } from "@/features/statistics/components/statistics-page";
import { useModuleContext } from "../components/module-context";

export function ModuleStatisticsPage() {
  const {
    moduleId,
    moduleName,
    statisticsCacheScope,
    statisticsRepository,
    navigateHome,
    navigateQuestionHistory,
  } = useModuleContext();

  if (!statisticsRepository) return null;

  return (
    <StatisticsPage
      repository={statisticsRepository}
      moduleId={moduleId}
      moduleName={moduleName}
      cacheScope={statisticsCacheScope}
      onBack={navigateHome}
      onOpenHistory={navigateQuestionHistory}
    />
  );
}
