package utils

import (
	"context"
	"fmt"
	"os"
	"time"

	orchestv1alpha1 "github.com/orchest/orchest/services/orchest-controller/pkg/apis/orchest/v1alpha1"
	"github.com/orchest/orchest/services/orchest-controller/pkg/client/clientset/versioned"
	ocinformersfactory "github.com/orchest/orchest/services/orchest-controller/pkg/client/informers/externalversions"
	orchestinformers "github.com/orchest/orchest/services/orchest-controller/pkg/client/informers/externalversions/orchest/v1alpha1"
	"github.com/pkg/errors"
	appsv1 "k8s.io/api/apps/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	kerrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/informers"
	appsinformers "k8s.io/client-go/informers/apps/v1"
	"k8s.io/client-go/kubernetes"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/klog/v2"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/apiutil"
)

func GetClientsOrDie(inCluster bool, scheme *runtime.Scheme) (
	kubernetes.Interface,
	versioned.Interface,
	client.Client) {

	var config *rest.Config
	var err error
	if inCluster {
		config, err = rest.InClusterConfig()
		if err != nil {
			klog.Fatalf("Can not get kubernetes config: %v", err)
		}
	} else {
		config, err = BuildOutsideClusterConfig()
		if err != nil {
			klog.Fatalf("Can not get kubernetes config: %v", err)
		}
	}

	kClient, err := kubernetes.NewForConfig(config)
	if err != nil {
		klog.Fatalf("Can not create kubernetes client: %v", err)
	}

	oClient, err := versioned.NewForConfig(config)
	if err != nil {
		klog.Fatalf("Can not get orchest client: %v", err)
	}

	mapper, err := apiutil.NewDynamicRESTMapper(config)
	if err != nil {
		klog.Fatalf("Can not get rest mapper: %v", err)
	}

	clientOptions := client.Options{Scheme: scheme, Mapper: mapper}

	gClient, err := client.New(config, clientOptions)
	if err != nil {
		klog.Fatalf("Can not general kubernetes client: %v", err)
	}

	return kClient, oClient, gClient
}

func GetScheme() *runtime.Scheme {

	scheme := runtime.NewScheme()
	clientgoscheme.AddToScheme(scheme)
	orchestv1alpha1.AddToScheme(scheme)
	apiextensionsv1.AddToScheme(scheme)

	return scheme
}

// BuildOutsideClusterConfig returns k8s config
func BuildOutsideClusterConfig() (*rest.Config, error) {
	kubeConfig := GetEnvOrDefault("KUBECONFIG", "~/.kube/config")

	config, err := clientcmd.BuildConfigFromFlags("", kubeConfig)
	if err != nil {
		return nil, errors.Wrap(err, "faile to build")
	}
	return config, nil
}

func GetEnvOrDefault(key, defaultValue string) string {

	value := os.Getenv("KUBECONFIG")
	if value == "" {
		value = defaultValue
	}

	return value
}

func NewOrchestClusterInformer(ocClient versioned.Interface) orchestinformers.OrchestClusterInformer {
	orchestInformerFactory := ocinformersfactory.NewSharedInformerFactory(ocClient, time.Second*30)
	return orchestInformerFactory.Orchest().V1alpha1().OrchestClusters()
}

func NewDeploymentInformer(client kubernetes.Interface) appsinformers.DeploymentInformer {
	appsInformerFactory := informers.NewSharedInformerFactoryWithOptions(client, time.Second*30)
	return appsInformerFactory.Apps().V1().Deployments()
}

// IsDeploymentReady checks if the number of required replicas is equal to number of created replicas
func IsDeploymentReady(ctx context.Context, client kubernetes.Interface, name, namespace string) bool {

	deployment, err := client.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if kerrors.IsNotFound(err) {
			klog.V(2).Info("deployment %s resource not found.", name)
		}
		// Error reading Deployment.
		return false
	}

	// Replicas is not intialized yet
	if deployment.Spec.Replicas == nil {
		return false
	}

	return *deployment.Spec.Replicas == deployment.Status.ReadyReplicas

}

func GetFullImageName(registry, imageName, tag string) string {
	if tag == "" {
		tag = "latest"
	}
	if registry != "" {
		return fmt.Sprintf("%s/orchest/%s:%s", registry, imageName, tag)
	}

	return fmt.Sprintf("orchest/%s:%s", imageName, tag)

}

func PauseDeployment(ctx context.Context,
	client kubernetes.Interface,
	hash string,
	deployment *appsv1.Deployment) error {

	ZeroReplica := int32(0)
	/*
		scale := &autoscalingv1.Scale{
			ObjectMeta: deployment.ObjectMeta,
			Spec: autoscalingv1.ScaleSpec{
				Replicas: 0,
			},
		}

		_, err := client.AppsV1().Deployments(deployment.Namespace).UpdateScale(ctx, deployment.Name, scale, metav1.UpdateOptions{})
		if err != nil {
			return errors.Wrapf(err, "failed to pause a deployment %s", deployment.Name)
		}
	*/

	cloneDep := deployment.DeepCopy()
	cloneDep.Spec.Paused = true
	cloneDep.Spec.Replicas = &ZeroReplica
	cloneDep.Labels[appsv1.ControllerRevisionHashLabelKey] = hash

	_, err := client.AppsV1().Deployments(deployment.Namespace).Update(ctx, cloneDep, metav1.UpdateOptions{})
	if err != nil {
		return errors.Wrapf(err, "failed to pause a deployment %s", deployment.Name)
	}

	return nil
}
