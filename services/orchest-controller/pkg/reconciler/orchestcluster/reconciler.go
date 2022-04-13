package orchestcluster

import (
	"context"
	"path"

	orchestv1alpha1 "github.com/orchest/orchest/services/orchest-controller/pkg/apis/orchest/v1alpha1"
	"github.com/orchest/orchest/services/orchest-controller/pkg/deployer"
	"github.com/orchest/orchest/services/orchest-controller/pkg/helm"
	"github.com/orchest/orchest/services/orchest-controller/pkg/utils"
	"github.com/pkg/errors"
	kerrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/klog/v2"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
)

type ReconcilerConfig struct {
	DeployDir                  string
	PostgresDefaultImage       string
	RabbitmqDefaultImage       string
	OrchestDefaultTag          string
	CeleryWorkerImageName      string
	OrchestApiImageName        string
	OrchestWebserverImageName  string
	AuthServerImageName        string
	UserdirDefaultVolumeSize   string
	ConfigdirDefaultVolumeSize string
	BuilddirDefaultVolumeSize  string
	InCluster                  bool
}

// OrchestClusterReconciler reconciles OrchestCluster CRD.
type OrchestClusterReconciler struct {
	client          client.Client
	config          *ReconcilerConfig
	scheme          *runtime.Scheme
	deployerManager *deployer.DeployerManager
}

// NewOrchestClusterReconciler returns a new *OrchestClusterReconciler.
func NewOrchestClusterReconciler(mgr ctrl.Manager, config *ReconcilerConfig) *OrchestClusterReconciler {

	reconciler := OrchestClusterReconciler{
		client: mgr.GetClient(),
		scheme: mgr.GetScheme(),
		config: config,
	}

	reconciler.intiDeployerManager()

	return &reconciler
}

func (r *OrchestClusterReconciler) intiDeployerManager() {
	r.deployerManager = deployer.NewDeployerManager()

	r.deployerManager.AddDeployer(helm.NewHelmDeployer("argo", path.Join(r.config.DeployDir, "thirdparty/argo-workflows")))
	r.deployerManager.AddDeployer(helm.NewHelmDeployer("registry", path.Join(r.config.DeployDir, "thirdparty/docker-registry")))
	r.deployerManager.AddDeployer(NewOrchestDeployer("orchest", r.client, r.config))

}

func (r *OrchestClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (_ ctrl.Result, reterr error) {

	// Get OrchestCluster CRD from kubernetes
	cluster := &orchestv1alpha1.OrchestCluster{}
	err := r.client.Get(ctx, req.NamespacedName, cluster)
	if err != nil {
		if kerrors.IsNotFound(err) {
			klog.V(2).Info("OrchestCluster %s resource not found.", req.NamespacedName)
			return reconcile.Result{}, nil
		}
		// Error reading OrchestCluster - The request will be requeued.
		return reconcile.Result{}, errors.Wrap(err, "failed to get OrchestCluster")
	}

	// Set a finalizer so we can do cleanup before the object goes away
	err = utils.AddFinalizerIfNotPresent(ctx, r.client, cluster, orchestv1alpha1.Finalizer)
	if err != nil {
		return reconcile.Result{}, errors.Wrap(err, "failed to add finalizer")
	}

	if !cluster.GetDeletionTimestamp().IsZero() {
		// The cluster is deleted, delete it
		return r.deleteOrchestCluster(ctx, req)
	}

	// Reconciling
	if err := r.reconcileCluster(ctx, cluster); err != nil {
		return reconcile.Result{}, errors.Wrapf(err, "failed to reconcile cluster %q", req.NamespacedName)
	}

	// Return and do not requeue
	return reconcile.Result{}, nil
}

func (r *OrchestClusterReconciler) deleteOrchestCluster(ctx context.Context,
	req ctrl.Request) (reconcile.Result, error) {

	cluster := &orchestv1alpha1.OrchestCluster{}
	if err := r.client.Get(ctx, req.NamespacedName, cluster); err != nil {
		return reconcile.Result{}, errors.Wrapf(err, "failed to get cluster %v during deleting cluster.", req.NamespacedName)
	}

	// Update Cluster status
	err := r.updateClusterStatus(ctx, cluster, orchestv1alpha1.Deleting, "Deleting the Cluster")
	if err != nil {
		return reconcile.Result{}, errors.Wrap(err, "failed to update cluster status finalizers")
	}
	// Remove finalizers
	err = utils.RemoveFinalizerIfNotPresent(ctx, r.client, cluster, orchestv1alpha1.Finalizer)
	if err != nil {
		return reconcile.Result{}, errors.Wrap(err, "failed to remove finalizers")
	}

	return reconcile.Result{}, nil
}

func (r *OrchestClusterReconciler) reconcileCluster(ctx context.Context, cluster *orchestv1alpha1.OrchestCluster) error {

	// If Status struct is not initialized yet, the cluster is new, create it
	if cluster.Status == nil {
		// Set the default values in CR if not specified
		copy := r.getClusterWithIfNotSpecified(ctx, cluster)
		err := r.updateClusterStatus(ctx, copy, orchestv1alpha1.Initializing, "Initializing orchest cluster")
		if err != nil {
			klog.Error(err)
			return err
		}
		return nil
	}

	switch cluster.Status.State {
	case orchestv1alpha1.Initializing:
		// First step is to deploy Argo
		err := r.updateClusterStatus(ctx, cluster, orchestv1alpha1.DeployingArgo, "Deploying Argo")
		if err != nil {
			klog.Error(err)
			return err
		}
	case orchestv1alpha1.DeployingArgo:
		err := r.deployerManager.Get("argo").InstallIfChanged(ctx, cluster.Namespace, nil)
		if err != nil {
			klog.Error(err)
			return err
		}

		err = r.updateClusterStatus(ctx, cluster, orchestv1alpha1.DeployingRegistry, "Deploying Registry")
		if err != nil {
			klog.Error(err)
			return err
		}
	case orchestv1alpha1.DeployingRegistry:
		err := r.deployerManager.Get("registry").InstallIfChanged(ctx, cluster.Namespace, nil)
		if err != nil {
			klog.Error(err)
			return err
		}

		err = r.updateClusterStatus(ctx, cluster, orchestv1alpha1.DeployingOrchest, "Deploying orchest")
		if err != nil {
			klog.Error(err)
			return err
		}
	case orchestv1alpha1.DeployingOrchest:
		err := r.deployerManager.Get("orchest").InstallIfChanged(ctx, cluster.Namespace, cluster)
		if err != nil {
			klog.Error(err)
			return err
		}

		err = r.updateClusterStatus(ctx, cluster, orchestv1alpha1.DeployingOrchest, "Deploying orchest")
		if err != nil {
			klog.Error(err)
			return err
		}

	}

	return nil

}

func (r *OrchestClusterReconciler) updateClusterStatus(ctx context.Context, cluster *orchestv1alpha1.OrchestCluster,
	state orchestv1alpha1.OrchestClusterState, message string) error {

	cluster.Status = &orchestv1alpha1.OrchestClusterStatus{
		State:   state,
		Message: message,
	}

	err := r.client.Status().Update(ctx, cluster)
	// If the object doesn't exist yet, it has to be initialized
	if kerrors.IsNotFound(err) {
		err = r.client.Update(ctx, cluster)
	}
	if err != nil {
		return errors.Wrapf(err, "failed to update orchest with status  %q", cluster.Name)
	}
	return nil
}

func (r *OrchestClusterReconciler) getClusterWithIfNotSpecified(ctx context.Context,
	cluster *orchestv1alpha1.OrchestCluster) *orchestv1alpha1.OrchestCluster {

	copy := cluster.DeepCopy()

	changed := false

	if copy.Spec.Orchest.DefaultTag == "" {
		changed = true
		copy.Spec.Orchest.DefaultTag = r.config.OrchestDefaultTag
	}

	if copy.Spec.Postgres.Image == "" {
		changed = true
		copy.Spec.Postgres.Image = r.config.PostgresDefaultImage
	}

	if copy.Spec.RabbitMq.Image == "" {
		changed = true
		copy.Spec.RabbitMq.Image = r.config.RabbitmqDefaultImage
	}

	if copy.Spec.Orchest.Resources.UserDirVolumeSize == "" {
		changed = true
		copy.Spec.Orchest.Resources.UserDirVolumeSize = r.config.UserdirDefaultVolumeSize
	}

	if copy.Spec.Orchest.Resources.BuilderCacheDirVolumeSize == "" {
		changed = true
		copy.Spec.Orchest.Resources.BuilderCacheDirVolumeSize = r.config.BuilddirDefaultVolumeSize
	}

	if copy.Spec.Orchest.Resources.ConfigDirVolumeSize == "" {
		changed = true
		copy.Spec.Orchest.Resources.ConfigDirVolumeSize = r.config.ConfigdirDefaultVolumeSize
	}

	if changed {
		return copy
	}
	return cluster
}
