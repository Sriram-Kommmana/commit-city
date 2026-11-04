// Builds aws/notes/template.yaml with the tested Lambda code inside it, so there's one file to upload.
// Run: node scripts/build-notes-template.mjs
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../aws/notes/index.cjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd();
if (code.length > 4096) throw new Error(`The Lambda code is ${code.length} characters; CloudFormation allows 4096 inline.`);
const inline = code
  .split('\n')
  .map((l) => (l ? `          ${l}` : ''))
  .join('\n');

const template = `AWSTemplateFormatVersion: '2010-09-09'
Description: Commit City notes wall. A DynamoDB table, a Lambda function and an HTTP API. Built from aws/notes/index.cjs.

Resources:
  NotesTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - { AttributeName: pk, AttributeType: S }
        - { AttributeName: sk, AttributeType: S }
      KeySchema:
        - { AttributeName: pk, KeyType: HASH }
        - { AttributeName: sk, KeyType: RANGE }
      TimeToLiveSpecification: { AttributeName: ttl, Enabled: true }

  NotesRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - { Effect: Allow, Principal: { Service: lambda.amazonaws.com }, Action: sts:AssumeRole }
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: notes-table
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - { Effect: Allow, Action: [dynamodb:Query, dynamodb:PutItem], Resource: !GetAtt NotesTable.Arn }

  NotesFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs22.x
      Handler: index.handler
      Role: !GetAtt NotesRole.Arn
      MemorySize: 128
      Timeout: 5
      Environment:
        Variables: { TABLE: !Ref NotesTable }
      Code:
        ZipFile: |
${inline}

  NotesApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: commit-city-notes
      ProtocolType: HTTP
      Target: !GetAtt NotesFunction.Arn
      CorsConfiguration:
        AllowOrigins: ['*']
        AllowMethods: [GET, POST]
        AllowHeaders: [content-type]
        MaxAge: 3600

  NotesApiPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref NotesFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub arn:\${AWS::Partition}:execute-api:\${AWS::Region}:\${AWS::AccountId}:\${NotesApi}/*

Outputs:
  NotesApiUrl:
    Description: Paste this into content/site.json as "notesApi".
    Value: !GetAtt NotesApi.ApiEndpoint
`;
fs.writeFileSync(new URL('../aws/notes/template.yaml', import.meta.url), template);
console.log(`aws/notes/template.yaml written (${code.length} characters of code inline)`);
