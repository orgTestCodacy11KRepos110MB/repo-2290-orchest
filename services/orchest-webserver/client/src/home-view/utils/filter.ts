import { PipelineMetaData, PipelineRun, Project } from "@/types";
import { SystemStatus } from "@/utils/system-status";

export type RunMaxAxe = "all" | "7 days" | "30 days";
export type RunSortDirection = "newest" | "oldest";

export type RunFilterState = {
  maxAge: RunMaxAxe;
  projects: Project[];
  pipelines: PipelineMetaData[];
  statuses: SystemStatus[];
  sort: RunSortDirection;
};

export const DEFAULT_FILTER: RunFilterState = {
  maxAge: "all",
  projects: [],
  pipelines: [],
  statuses: [],
  sort: "newest",
};

export const isEmptyFilter = (filter: RunFilterState) =>
  filter.maxAge === DEFAULT_FILTER.maxAge &&
  filter.projects.length === 0 &&
  filter.pipelines.length === 0 &&
  filter.statuses.length === 0;

export const maxAgeInMilliseconds = (maxAge: RunMaxAxe) => {
  switch (maxAge) {
    case "30 days":
      return 30 * 24 * 60 * 60 * 1000;
    case "7 days":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return Infinity;
  }
};

const matchesMaxAge = (run: PipelineRun, maxAge: RunMaxAxe) =>
  Date.parse(run.started_time) + maxAgeInMilliseconds(maxAge) > Date.now();

const matchesRunFilter = (run: PipelineRun, filter: RunFilterState) =>
  (!filter.statuses.length || filter.statuses.includes(run.status)) &&
  (!filter.projects.length ||
    filter.projects.some((project) => project.uuid === run.project_uuid)) &&
  (!filter.pipelines.length ||
    filter.pipelines.some(
      (pipeline) =>
        pipeline.project_uuid === run.project_uuid &&
        pipeline.uuid === run.pipeline_uuid
    )) &&
  matchesMaxAge(run, filter.maxAge);

/** Filters and sorts the pipeline runs according to the filter state. */
export const filterRuns = (runs: PipelineRun[], filter: RunFilterState) =>
  runs
    .filter((run) => matchesRunFilter(run, filter))
    .sort((left, right) =>
      filter.sort === "oldest"
        ? left.started_time.localeCompare(right.started_time)
        : right.started_time.localeCompare(left.started_time)
    );
