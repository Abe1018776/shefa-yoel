"""
Launch Gemini 2.5 Pro fine-tuning job on Vertex AI.

Prerequisites:
1. Install: pip install google-cloud-aiplatform
2. Authenticate: gcloud auth application-default login
3. Set project: gcloud config set project YOUR_PROJECT_ID
4. Enable APIs: gcloud services enable aiplatform.googleapis.com
5. Upload dataset to GCS: gsutil cp dataset_v2.jsonl gs://YOUR_BUCKET/shefa-yoel/dataset_v2.jsonl

Usage:
  python launch_finetune.py --project YOUR_PROJECT_ID --bucket YOUR_BUCKET
"""
import argparse
import sys

try:
    from google.cloud import aiplatform
except ImportError:
    print("ERROR: google-cloud-aiplatform not installed.")
    print("Run: pip install google-cloud-aiplatform")
    sys.exit(1)


def launch(project_id: str, bucket: str, region: str = "us-central1",
           epochs: int = 3, learning_rate_multiplier: float = 1.0):
    """Launch a supervised fine-tuning job for Gemini 2.5 Pro."""

    aiplatform.init(project=project_id, location=region)

    dataset_uri = f"gs://{bucket}/shefa-yoel/dataset_v2.jsonl"

    # Create the supervised tuning job
    sft_tuning_job = aiplatform.SupervisedTuningJob(
        source_model="gemini-2.5-pro-preview-05-06",
        train_dataset=dataset_uri,
        # Optional: validation split
        # validation_dataset=f"gs://{bucket}/shefa-yoel/dataset_v2_val.jsonl",
        tuned_model_display_name="shefa-yoel-gemini-2.5-pro",
        epochs=epochs,
        learning_rate_multiplier=learning_rate_multiplier,
    )

    print(f"Launching fine-tuning job...")
    print(f"  Model: gemini-2.5-pro-preview-05-06")
    print(f"  Dataset: {dataset_uri}")
    print(f"  Epochs: {epochs}")
    print(f"  Region: {region}")

    # Start the job (non-blocking)
    sft_tuning_job.run()

    print(f"\nJob started!")
    print(f"  Job name: {sft_tuning_job.resource_name}")
    print(f"  Tuned model: {sft_tuning_job.tuned_model_name}")
    print(f"\nMonitor at: https://console.cloud.google.com/vertex-ai/generative/language/tuning?project={project_id}")

    return sft_tuning_job


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Launch Gemini 2.5 Pro fine-tuning on Vertex AI")
    parser.add_argument('--project', required=True, help='GCP project ID')
    parser.add_argument('--bucket', required=True, help='GCS bucket name (without gs://)')
    parser.add_argument('--region', default='us-central1', help='Vertex AI region')
    parser.add_argument('--epochs', type=int, default=3, help='Number of training epochs')
    parser.add_argument('--lr-multiplier', type=float, default=1.0, help='Learning rate multiplier')
    args = parser.parse_args()

    launch(args.project, args.bucket, args.region, args.epochs, args.lr_multiplier)
