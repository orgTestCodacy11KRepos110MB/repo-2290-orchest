import { useToggle } from "@/hooks/useToggle";
import { formatPipelineParams } from "@/jobs-view/common";
import { PipelineRun } from "@/types";
import { humanizeDate } from "@/utils/date-time";
import { isJobRun } from "@/utils/pipeline-run";
import { ChevronRightSharp } from "@mui/icons-material";
import MoreHorizOutlined from "@mui/icons-material/MoreHorizOutlined";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import React from "react";
import { SystemStatusChip } from "../common/SystemStatusChip";
import { PipelineRunBreadcrumbs } from "./PipelineRunBreadcrumbs";
import { PipelineRunContextMenu } from "./PipelineRunContextMenu";

export type PipelineRunRowProps = {
  /** The run to display: either an interactive or job run. */
  run: PipelineRun;
  /** Whether or not the rows should be expandable, revealing all parameters. */
  expandable?: boolean;
  /** Whether or not breadcrumbs (project, pipeline, job) should be displayed in each row. */
  breadcrumbs?: boolean;
};

export const PipelineRunRow = ({
  run,
  expandable = false,
  breadcrumbs = false,
}: PipelineRunRowProps) => {
  const [isExpanded, toggleRow] = useToggle();
  const [isMenuOpen, toggleMenu] = useToggle();
  const moreButtonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <>
      <TableRow sx={{ "& > *": { borderBottom: "unset" } }}>
        {expandable && (
          <TableCell sx={{ width: 0, padding: 0, margin: 0 }}>
            <IconButton
              aria-label="expand row"
              size="small"
              onClick={() => toggleRow()}
            >
              <ChevronRightSharp
                style={{
                  transform: isExpanded ? "rotate(90deg)" : undefined,
                  transition: "transform 150ms ease-in",
                }}
              />
            </IconButton>
          </TableCell>
        )}

        <TableCell sx={{ width: "100%" }}>
          <Stack justifyContent="center">
            <Box>
              {isJobRun(run)
                ? "#" + (run.job_run_index + 1)
                : "Interactive run"}{" "}
              <span>
                {formatPipelineParams(run.parameters ?? {})
                  .join(", ")
                  .trim()}
              </span>
            </Box>
            {breadcrumbs && <PipelineRunBreadcrumbs run={run} />}
          </Stack>
        </TableCell>

        <TableCell sx={{ textAlign: "right" }}>
          <SystemStatusChip status={run.status} flavor="job" size="small" />
        </TableCell>

        <TableCell sx={{ textAlign: "right", whiteSpace: "nowrap" }}>
          {run.started_time ? humanizeDate(run.started_time) : "—"}
        </TableCell>

        <TableCell sx={{ textAlign: "right" }}>
          <IconButton ref={moreButtonRef} onClick={() => toggleMenu(true)}>
            <MoreHorizOutlined fontSize="small" />
          </IconButton>
        </TableCell>
      </TableRow>

      {expandable && (
        <TableRow>
          <TableCell sx={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
              <RunDetails run={run} />
            </Collapse>
          </TableCell>
        </TableRow>
      )}

      <PipelineRunContextMenu
        open={isMenuOpen}
        onClose={() => toggleMenu(false)}
        run={run}
        anchorEl={moreButtonRef.current}
      />
    </>
  );
};

export type RunDetailsProps = { run: PipelineRun };

export const RunDetails = ({ run }: RunDetailsProps) => {
  const params = formatPipelineParams(run.parameters);
  const hasParameters = params.length > 0;

  return (
    <Stack
      sx={{ margin: (theme) => theme.spacing(1, 0) }}
      direction="column"
      justifyContent="flex-start"
    >
      {params.map((param, index) => (
        <Typography variant="caption" key={index}>
          {param}
        </Typography>
      ))}
      {!hasParameters && <NoParameterAlert />}
    </Stack>
  );
};

export const NoParameterAlert = () => (
  <Typography variant="body2">
    <i>{"This Pipeline didn't have any Parameters defined."}</i>
  </Typography>
);
