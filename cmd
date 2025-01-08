docker build . -t mundo
docker tag mundo gcr.io/my-project-backend-447204/mundo:latest
docker push gcr.io/my-project-backend-447204/mundo:latest
gcloud run deploy mundo --image gcr.io/my-project-backend-447204/mundo:latest --platform managed --region asia-northeast3 --allow-unauthenticated