import { PipelineRunsTable } from "@/components/pipeline-runs/PipelineRunsTable";
import { useFetchJobs } from "@/hooks/useFetchJobs";
import { useFetchPipelines } from "@/hooks/useFetchPipelines";
import { usePollPipelineRuns } from "@/hooks/usePollPipelineRuns";
import React from "react";

export const AllRunsTab = () => {
  useFetchJobs();
  useFetchPipelines();

  const { runs: interactiveRuns } = usePollPipelineRuns();
  const ongoingRuns = interactiveRuns.filter(
    (run) => run.status === "STARTED" || run.status === "PENDING"
  );

  return (
    <>
      <PipelineRunsTable breadcrumbs runs={ongoingRuns} />
    </>
  );
};
