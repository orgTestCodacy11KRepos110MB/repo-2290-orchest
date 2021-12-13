import { TabLabel, TabPanel, Tabs } from "@/components/common/Tabs";
import ImageBuildLog from "@/components/ImageBuildLog";
import { Layout } from "@/components/Layout";
import { useAppContext } from "@/contexts/AppContext";
import { useCustomRoute } from "@/hooks/useCustomRoute";
import { useSendAnalyticEvent } from "@/hooks/useSendAnalyticEvent";
import { siteMap } from "@/Routes";
import type { Environment, EnvironmentBuild } from "@/types";
import CloseIcon from "@mui/icons-material/Close";
import MemoryIcon from "@mui/icons-material/Memory";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import ViewHeadlineIcon from "@mui/icons-material/ViewHeadline";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import {
  MDCButtonReact,
  MDCCheckboxReact,
  MDCSelectReact,
  MDCTextFieldReact,
} from "@orchest/lib-mdc";
import {
  DEFAULT_BASE_IMAGES,
  LANGUAGE_MAP,
  makeCancelable,
  makeRequest,
  PromiseManager,
  RefManager,
  uuidv4,
} from "@orchest/lib-utils";
import "codemirror/mode/shell/shell";
import React from "react";
import { Controlled as CodeMirror } from "react-codemirror2";

const CANCELABLE_STATUSES = ["PENDING", "STARTED"];

const tabs = [
  {
    id: "environment-properties",
    label: "Properties",
    icon: <TuneIcon />,
  },
  {
    id: "environment-build",
    label: "Build",
    icon: <ViewHeadlineIcon />,
  },
];

const EnvironmentEditView: React.FC = () => {
  // global states
  const {
    setAlert,
    setAsSaved,
    state: { config, hasUnsavedChanges },
  } = useAppContext();

  useSendAnalyticEvent("view load", { name: siteMap.environment.path });

  // data from route
  const { projectUuid, environmentUuid, navigateTo } = useCustomRoute();

  // local states
  const [isNewEnvironment, setIsNewEnvironment] = React.useState(
    environmentUuid === "create"
  );
  const [environment, setEnvironment] = React.useState<Environment>({
    uuid: "new",
    project_uuid: projectUuid,
    ...config.ENVIRONMENT_DEFAULTS,
  });

  const [
    isShowingAddCustomImageDialog,
    setIsShowingAddCustomImageDialog,
  ] = React.useState(false);

  const [tabIndex, setTabIndex] = React.useState(0);

  const [state, setState] = React.useState({
    baseImages: [...DEFAULT_BASE_IMAGES],
    ignoreIncomingLogs: false,
    building: false,
    buildRequestInProgress: false,
    cancelBuildRequestInProgress: false,
    environmentBuild: undefined,
    buildFetchHash: uuidv4(),
    customBaseImageName: "",
    languageDocsNotice: false,
  });

  const [refManager] = React.useState(new RefManager());
  const [promiseManager] = React.useState(new PromiseManager());

  const fetchEnvironment = () => {
    // only fetch existing environment
    if (isNewEnvironment) return;

    let endpoint = `/store/environments/${projectUuid}/${environmentUuid}`;

    let cancelableRequest = makeCancelable(
      makeRequest("GET", endpoint),
      promiseManager
    );

    // @ts-ignore
    cancelableRequest.promise
      .then((response: string) => {
        let fetchedEnvironment: Environment = JSON.parse(response);

        setEnvironment(fetchedEnvironment);
        setState((prevState) => ({
          ...prevState,
          baseImages:
            DEFAULT_BASE_IMAGES.indexOf(fetchedEnvironment.base_image) == -1
              ? DEFAULT_BASE_IMAGES.concat(fetchedEnvironment.base_image)
              : [...DEFAULT_BASE_IMAGES],
        }));
      })
      // @ts-ignore
      .catch((error) => {
        console.error(error);
      });
  };

  const save = () => {
    // Saving an environment will invalidate the Jupyter <iframe>
    // TODO: perhaps this can be fixed with coordination between JLab +
    // Enterprise Gateway team.
    window.orchest.jupyter.unload();

    return makeCancelable<Environment>(
      new Promise((resolve, reject) => {
        if (!environment) {
          reject();
          return;
        }

        let method = isNewEnvironment ? "POST" : "PUT";
        let endpoint = `/store/environments/${projectUuid}/${environment.uuid}`;

        makeRequest(method, endpoint, {
          type: "json",
          content: { environment },
        })
          .then((response: string) => {
            let result: Environment = JSON.parse(response);

            environment.uuid = result.uuid;

            setEnvironment((prev) => ({ ...prev, uuid: result.uuid }));
            setIsNewEnvironment(false);

            setAsSaved();

            resolve(result);
          })
          .catch((error) => {
            console.log(error);

            try {
              console.error(JSON.parse(error.body)["message"]);
            } catch (error) {
              console.log(error);
              console.log("Couldn't get error message from response.");
            }

            reject();
          });
      }),
      promiseManager
    ).promise;
  };

  const onSave = (e: React.MouseEvent) => {
    const validEnvironmentName = (name: string) => {
      if (!name) {
        return false;
      }
      // Negative lookbehind. Check that every " is escaped with \
      for (let x = 0; x < name.length; x++) {
        if (name[x] == '"') {
          if (x == 0) {
            return false;
          } else {
            if (name[x - 1] != "\\") {
              return false;
            }
          }
        }
      }
      return true;
    };

    if (!validEnvironmentName(environment.name)) {
      setAlert(
        "Error",
        'Double quotation marks in the "Environment name" have to be escaped using a backslash.'
      );
    } else {
      e.preventDefault();
      save();
    }
  };

  const returnToEnvironments = () => {
    navigateTo(siteMap.environments.path, {
      query: { projectUuid },
    });
  };

  const onChangeName = (value: string) => {
    setEnvironment((prev) => ({ ...prev, name: value }));

    setAsSaved(false);
  };

  const onChangeBaseImage = (value: string) => {
    setEnvironment((prev) => ({ ...prev, base_image: value }));

    setAsSaved(false);
  };

  const onChangeLanguage = (value: string) => {
    setEnvironment((prev) => ({ ...prev, language: value }));

    setAsSaved(false);
  };

  const onGPUChange = (isChecked: boolean) => {
    setEnvironment((prev) => ({ ...prev, gpu_support: isChecked }));

    setAsSaved(false);
  };

  const onCloseAddCustomBaseImageDialog = () => {
    setIsShowingAddCustomImageDialog(false);
  };

  const submitAddCustomBaseImage = () => {
    setState((prevState) => {
      setEnvironment((prev) => ({
        ...prev,
        base_image: prevState.customBaseImageName,
      }));

      setIsShowingAddCustomImageDialog(false);

      return {
        ...prevState,
        customBaseImageName: "",
        baseImages:
          prevState.baseImages.indexOf(prevState.customBaseImageName) == -1
            ? prevState.baseImages.concat(prevState.customBaseImageName)
            : prevState.baseImages,
      };
    });

    setAsSaved(false);
  };

  const onAddCustomBaseImage = () => {
    setIsShowingAddCustomImageDialog(true);
  };

  const onSelectSubview = (e, index: number) => {
    setTabIndex(index);
  };

  const build = (e: React.MouseEvent) => {
    e.nativeEvent.preventDefault();
    refManager.refs.tabBar.tabBar.activateTab(1);

    setState((prevState) => ({
      ...prevState,
      buildRequestInProgress: true,
      ignoreIncomingLogs: true,
    }));

    save().then(() => {
      let buildPromise = makeCancelable(
        makeRequest("POST", "/catch/api-proxy/api/environment-builds", {
          type: "json",
          content: {
            environment_build_requests: [
              {
                environment_uuid: environment.uuid,
                project_uuid: projectUuid,
              },
            ],
          },
        }),
        promiseManager
      );

      // @ts-ignore
      buildPromise.promise
        .then((response: string) => {
          try {
            let environmentBuild: EnvironmentBuild = JSON.parse(response)[
              "environment_builds"
            ][0];

            onUpdateBuild(environmentBuild);
          } catch (error) {
            console.error(error);
          }
        })
        // @ts-ignore
        .catch((e) => {
          if (!e.isCanceled) {
            setState((prevState) => ({
              ...prevState,
              ignoreIncomingLogs: false,
            }));
            console.log(e);
          }
        })
        .finally(() => {
          setState((prevState) => ({
            ...prevState,
            buildRequestInProgress: false,
          }));
        });
    });
  };

  const cancelBuild = () => {
    // send DELETE to cancel ongoing build
    if (
      state.environmentBuild &&
      CANCELABLE_STATUSES.indexOf(state.environmentBuild.status) !== -1
    ) {
      setState((prevState) => ({
        ...prevState,
        cancelBuildRequestInProgress: true,
      }));

      makeRequest(
        "DELETE",
        `/catch/api-proxy/api/environment-builds/${state.environmentBuild.uuid}`
      )
        .then(() => {
          // immediately fetch latest status
          // NOTE: this DELETE call doesn't actually destroy the resource, that's
          // why we're querying it again.
          setState((prevState) => ({ ...prevState, buildFetchHash: uuidv4() }));
        })
        .catch((error) => {
          console.error(error);
        })
        .finally(() => {
          setState((prevState) => ({
            ...prevState,
            cancelBuildRequestInProgress: false,
          }));
        });
    } else {
      setAlert(
        "Error",
        "Could not cancel build, please try again in a few seconds."
      );
    }
  };

  const onBuildStart = () => {
    setState((prevState) => ({
      ...prevState,
      ignoreIncomingLogs: false,
    }));
  };

  const onUpdateBuild = (environmentBuild) => {
    setState((prevState) => ({
      ...prevState,
      building: CANCELABLE_STATUSES.indexOf(environmentBuild.status) !== -1,
      environmentBuild,
    }));
  };

  React.useEffect(() => {
    setAsSaved(!isNewEnvironment);

    if (!isNewEnvironment) fetchEnvironment();

    return () => promiseManager.cancelCancelablePromises();
  }, []);

  return (
    <Layout>
      <div className={"view-page edit-environment"}>
        {!environment ? (
          <LinearProgress />
        ) : (
          <>
            <Dialog
              open={isShowingAddCustomImageDialog}
              onClose={onCloseAddCustomBaseImageDialog}
            >
              <DialogTitle>Add custom base image</DialogTitle>
              <DialogContent>
                <MDCTextFieldReact
                  label="Base image name"
                  value={state.customBaseImageName}
                  onChange={(value) =>
                    setState((nestedPrevState) => ({
                      ...nestedPrevState,
                      customBaseImageName: value,
                    }))
                  }
                />
              </DialogContent>
              <DialogActions>
                <MDCButtonReact
                  classNames={["push-right"]}
                  label="Cancel"
                  onClick={onCloseAddCustomBaseImageDialog}
                />
                <MDCButtonReact
                  label="Add"
                  icon="check"
                  classNames={["mdc-button--raised"]}
                  submitButton
                  onClick={submitAddCustomBaseImage}
                />
              </DialogActions>
            </Dialog>

            <div className="push-down">
              <MDCButtonReact
                label="Back to environments"
                icon="arrow_back"
                onClick={returnToEnvironments}
              />
            </div>

            <div className="push-down-7">
              <Tabs
                value={tabIndex}
                onChange={onSelectSubview}
                label="environment-tabs"
                data-test-id="environments"
              >
                {tabs.map((tab) => (
                  <Tab
                    key={tab.id}
                    id={tab.id}
                    label={<TabLabel icon={tab.icon}>{tab.label}</TabLabel>}
                    aria-controls={tab.id}
                  />
                ))}
              </Tabs>
            </div>
            <TabPanel value={tabIndex} index={0} name="properties">
              <div className="environment-properties">
                <MDCTextFieldReact
                  classNames={["fullwidth", "push-down-7"]}
                  label="Environment name"
                  onChange={onChangeName}
                  value={environment.name}
                  data-test-id="environments-env-name"
                />

                <div className="select-button-columns">
                  <MDCSelectReact
                    ref={refManager.nrefs.environmentName}
                    classNames={["fullwidth"]}
                    label="Base image"
                    onChange={onChangeBaseImage}
                    value={environment.base_image}
                    options={state.baseImages.map((el) => [el])}
                  />
                  <MDCButtonReact
                    icon="add"
                    label="Custom image"
                    onClick={onAddCustomBaseImage}
                  />
                  <div className="clear"></div>
                </div>
                <div className="form-helper-text push-down-7">
                  The base image will be the starting point from which the
                  environment will be built.
                </div>

                <MDCSelectReact
                  label="Language"
                  classNames={["fullwidth"]}
                  ref={refManager.nrefs.environmentLanguage}
                  onChange={onChangeLanguage}
                  options={[
                    ["python", LANGUAGE_MAP["python"]],
                    ["r", LANGUAGE_MAP["r"]],
                    ["julia", LANGUAGE_MAP["julia"]],
                  ]}
                  value={environment.language}
                />
                <div className="form-helper-text push-down-7">
                  The language determines for which kernel language this
                  environment can be used. This only affects pipeline steps that
                  point to a Notebook.
                </div>

                {state.languageDocsNotice === true && (
                  <div className="docs-notice push-down-7">
                    Language explanation
                  </div>
                )}

                <MDCCheckboxReact
                  onChange={onGPUChange}
                  label="GPU support"
                  classNames={["push-down-7"]}
                  value={environment.gpu_support}
                  ref={refManager.nrefs.environmentGPUSupport}
                />

                {(() => {
                  if (environment.gpu_support === true) {
                    let enabledBlock = (
                      <p className="push-down-7">
                        If enabled, the environment will request GPU
                        capabilities when in use.
                      </p>
                    );
                    if (config.GPU_ENABLED_INSTANCE !== true) {
                      if (config.CLOUD === true) {
                        return (
                          <div className="docs-notice push-down-7">
                            <p>
                              This instance is not configured with a GPU. Change
                              the instance type to a GPU enabled one if you need
                              GPU pass-through. Steps using this environment
                              will work regardless, but no GPU pass-through will
                              take place.
                            </p>
                          </div>
                        );
                      } else {
                        return (
                          <div className="docs-notice push-down-7">
                            {enabledBlock}
                            <p>
                              Could not detect a GPU. Check out{" "}
                              <a
                                target="_blank"
                                href={
                                  config.ORCHEST_WEB_URLS.readthedocs +
                                  "/getting_started/installation.html#gpu-support"
                                }
                                rel="noreferrer"
                              >
                                the documentation
                              </a>{" "}
                              to make sure Orchest is properly configured for
                              environments with GPU support. In particular, make
                              sure the selected base image supports GPU pass
                              through. Steps using this environment will work
                              regardless, but no GPU pass-through will take
                              place.
                            </p>
                          </div>
                        );
                      }
                    } else {
                      return (
                        <div className="docs-notice push-down-7">
                          {enabledBlock}
                        </div>
                      );
                    }
                  }
                })()}
              </div>
            </TabPanel>
            <TabPanel value={tabIndex} index={1} name="build">
              <h3>Environment set-up script</h3>
              <div className="form-helper-text push-down-7">
                This will execute when you build the environment. Use it to
                include your dependencies.
              </div>
              <div className="push-down-7">
                <CodeMirror
                  value={environment.setup_script}
                  options={{
                    mode: "application/x-sh",
                    theme: "jupyter",
                    lineNumbers: true,
                    viewportMargin: Infinity,
                  }}
                  onBeforeChange={(editor, data, value) => {
                    setEnvironment((prev) => ({
                      ...prev,
                      setup_script: value,
                    }));

                    setAsSaved(false);
                  }}
                />
              </div>
              {environment && !isNewEnvironment && (
                <ImageBuildLog
                  buildFetchHash={state.buildFetchHash}
                  buildRequestEndpoint={`/catch/api-proxy/api/environment-builds/most-recent/${projectUuid}/${environment.uuid}`}
                  buildsKey="environment_builds"
                  socketIONamespace={
                    config.ORCHEST_SOCKETIO_ENV_BUILDING_NAMESPACE
                  }
                  streamIdentity={projectUuid + "-" + environment.uuid}
                  onUpdateBuild={onUpdateBuild}
                  onBuildStart={onBuildStart}
                  ignoreIncomingLogs={state.ignoreIncomingLogs}
                  build={state.environmentBuild}
                  building={state.building}
                />
              )}
            </TabPanel>
            <Stack
              spacing={2}
              direction="row"
              sx={{ padding: (theme) => theme.spacing(1) }}
            >
              <Button
                variant="contained"
                onClick={onSave}
                startIcon={<SaveIcon />}
                data-test-id="environments-save"
              >
                {hasUnsavedChanges ? "Save*" : "Save"}
              </Button>
              {tabIndex === 1 &&
                !isNewEnvironment &&
                (!state.building ? (
                  <Button
                    disabled={state.buildRequestInProgress}
                    variant="contained"
                    color="secondary"
                    onClick={build}
                    startIcon={<MemoryIcon />}
                    data-test-id="environments-start-build"
                  >
                    Build
                  </Button>
                ) : (
                  <Button
                    disabled={state.cancelBuildRequestInProgress}
                    variant="contained"
                    color="secondary"
                    onClick={cancelBuild}
                    startIcon={<CloseIcon />}
                    data-test-id="environments-cancel-build"
                  >
                    Cancel build
                  </Button>
                ))}
            </Stack>
          </>
        )}
      </div>
    </Layout>
  );
};

export default EnvironmentEditView;
