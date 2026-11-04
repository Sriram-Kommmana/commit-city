# Turning on the notes wall

The wall at the bottom of the page stores notes in AWS: a DynamoDB table, a Lambda function and an HTTP API. All three
come from one CloudFormation template, [`aws/notes/template.yaml`](../aws/notes/template.yaml), built from the tested
code in [`aws/notes/index.cjs`](../aws/notes/index.cjs). Until it's connected, the wall says it opens once the site is live.

## Set it up (about 5 minutes)

1. Sign in to the AWS console with the account you're using for Amplify. Pick one region and use it for everything,
   for example **Asia Pacific (Mumbai)**.
2. Open **CloudFormation** → **Create stack** → **With new resources (standard)**.
3. Choose **Upload a template file**, select `aws/notes/template.yaml`, then **Next**.
4. Name the stack `commit-city-notes`, then **Next**, and **Next** again on the options page.
5. Tick **I acknowledge that AWS CloudFormation might create IAM resources** and press **Submit**.
6. Wait about a minute for the status to say **CREATE_COMPLETE**.
7. Open the **Outputs** tab and copy **NotesApiUrl**. It looks like `https://abc123.execute-api.ap-south-1.amazonaws.com`.
8. Open that URL in a browser. You should see `{"notes":[]}`.
9. Paste the URL into [`content/site.json`](../content/site.json) as `"api"` under `"notes"`, then commit and push.
   Amplify redeploys the site, and the wall opens.

## What protects the wall

Notes go up instantly, so the Lambda function checks every post:

- Notes are 2 to 240 characters, names up to 32.
- No links, which stops most spam.
- A short list of swear words is masked with asterisks.
- One note per visitor every 30 seconds. Visitors are told apart by a hash of their IP address; the address itself is
  never stored.
- A hidden form field catches bots: they're told the post worked, and nothing is saved.
- Notes are shown with `textContent`, so nothing anyone writes can become HTML on the page.

## Removing a note

**DynamoDB** → **Tables** → the table whose name starts with `commit-city-notes` → **Explore table items**. Notes have
`pk` = `note`. Select the one to remove → **Actions** → **Delete items**. It disappears from the wall on the next reload.

## Cost

Well inside the AWS free tier for a portfolio: on-demand DynamoDB, a 128 MB Lambda function and an HTTP API all cost
fractions of a cent at this scale. Set a **$1 budget alert** in **Billing** → **Budgets** anyway.

## Changing the code

1. Edit `aws/notes/index.cjs`.
2. `npm run test:notes` runs the checks against an in-memory stand-in for DynamoDB.
3. `npm run build:notes` rebuilds `aws/notes/template.yaml` with the new code inside.
4. CloudFormation → the `commit-city-notes` stack → **Update** → **Replace current template** → upload the new file.
