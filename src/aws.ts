/* eslint-disable no-console */

import * as S3 from '@aws-sdk/client-s3'
import * as CloudFormation from '@aws-sdk/client-cloudformation'
import * as ECR from '@aws-sdk/client-ecr'
import * as Lambda from '@aws-sdk/client-lambda'
import * as IAM from '@aws-sdk/client-iam'
import * as EventBridge from '@aws-sdk/client-eventbridge'
import * as CloudFront from '@aws-sdk/client-cloudfront'
import * as ACM from '@aws-sdk/client-acm'
import * as CPSSO from '@aws-sdk/credential-provider-sso'

import {AwsCredentialIdentity} from '@aws-sdk/types'
import {ArgumentParser, Namespace} from 'argparse'

class AWSRemoveAll {
  readonly region: string
  private args: Namespace

  constructor(args: Namespace, region = 'eu-central-1') {
    this.region = region
    this.args = args
  }

  async getSSOCredentials(): Promise<AwsCredentialIdentity> {
    return await CPSSO.fromSSO({profile: this.args.ssoProfile})()
  }

  async removeAllS3Buckets(): Promise<void> {
    if (this.args.debug) console.log('removeAllS3Buckets()')
    const s3Client = new S3.S3Client({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const {Buckets} = await s3Client.send(new S3.ListBucketsCommand({}))
    for (const bucket of Buckets!) {
      if (this.args.debug) console.log(`delete bucket: ${bucket.Name}`)

      const {Contents} = await s3Client.send(new S3.ListObjectsV2Command({Bucket: bucket.Name!}))

      // Delete each object in the bucket
      // const {Contents} = await s3Client.send(new S3.ListObjectsCommand({Bucket: bucket.Name!}))
      // Check if Versions is undefined ?? []
      for (const content of Contents ?? []) {
        try {
          await s3Client.send(
            new S3.DeleteObjectCommand({
              Bucket: bucket.Name!,
              Key: content.Key!,
            }),
          )
        } catch (err) {
          if (this.args.debug) console.error(err)
        }
      }

      const {Versions} = await s3Client.send(new S3.ListObjectVersionsCommand({Bucket: bucket.Name!}))
      // Check if Versions is undefined ?? []
      for (const version of Versions ?? []) {
        try {
          await s3Client.send(
            new S3.DeleteObjectCommand({
              Bucket: bucket.Name!,
              Key: version.Key!,
              VersionId: version.VersionId!,
            }),
          )
        } catch (err) {
          if (this.args.debug) console.error(err)
        }
      }

      try {
        const response = await s3Client.send(new S3.DeleteBucketCommand({Bucket: bucket.Name!}))
        if (this.args.debug) console.log(response)
      } catch (err) {
        if (this.args.debug) console.error(err)
      }
    }
  }

  async removeAllCloudFormationStacks() {
    if (this.args.debug) console.log('removeAllCloudFormationStacks()')
    const cfClient = new CloudFormation.CloudFormationClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await cfClient.send(new CloudFormation.ListStacksCommand({}))

    for (const stack of result.StackSummaries ?? []) {
      if (stack.StackStatus !== 'DELETE_COMPLETE') {
        // TODO: Delete all recourses
        // const resources = await cfClient.send(
        //   new CloudFormation.ListStackResourcesCommand({StackName: stack.StackName!})
        // )

        try {
          if (this.args.debug) console.log(`delete stack: ${stack.StackName}`)
          await cfClient.send(
            new CloudFormation.DeleteStackCommand({
              StackName: stack.StackName!,
              // RetainResources: resources.StackResourceSummaries!
              //   .filter(r => r.ResourceStatus !== "DELETE_COMPLETE")
              //   .map(r => r.LogicalResourceId!)
            }),
          )
        } catch (err) {
          if (this.args.debug) console.error(`Error ${stack.StackName}: ${err}`)
        }
      }
    }
  }

  async removeAllECRRepositories() {
    if (this.args.debug) console.log('removeAllECRRepositories()')
    const ecrClient = new ECR.ECRClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await ecrClient.send(new ECR.DescribeRepositoriesCommand({}))

    for (const repository of result.repositories ?? []) {
      const images = await ecrClient.send(new ECR.ListImagesCommand({repositoryName: repository.repositoryName!}))
      for (const image of images.imageIds ?? []) {
        try {
          if (this.args.debug) console.log(`delete image: ${repository.repositoryName}:${image.imageTag}`)
          await ecrClient.send(
            new ECR.BatchDeleteImageCommand({
              repositoryName: repository.repositoryName!,
              imageIds: [{imageTag: image.imageTag}],
            }),
          )
        } catch (err) {
          if (this.args.debug) console.error(`Error ${repository.repositoryName}:${image.imageTag}: ${err}`)
        }
      }

      try {
        if (this.args.debug) console.log(`delete repository: ${repository.repositoryName}`)
        await ecrClient.send(new ECR.DeleteRepositoryCommand({repositoryName: repository.repositoryName!}))
      } catch (err) {
        if (this.args.debug) console.error(`Error ${repository.repositoryName}: ${err}`)
      }
    }
  }

  async removeAllECSRepositories() {
    if (this.args.debug) console.log('removeAllECSRepositories()')
    // TODO
  }

  async removeAllLambdaFunctions() {
    if (this.args.debug) console.log('removeAllLambdaFunctions()')
    const lambdaClient = new Lambda.LambdaClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await lambdaClient.send(new Lambda.ListFunctionsCommand({}))
    // TODO: remove application

    //
    for (const lambda of result.Functions ?? []) {
      try {
        if (this.args.debug) console.log(`delete lambda: ${lambda.FunctionName}`)
        await lambdaClient.send(new Lambda.DeleteFunctionCommand({FunctionName: lambda.FunctionName!}))
      } catch (err) {
        if (this.args.debug) console.error(`Error ${lambda.FunctionName}: ${err}`)
      }
    }
  }

  async removeAllIAMOrganizations() {
    // TODO: Add support for IAM Organizations accounts
  }

  async removeAllIAMIdentityCenter() {
    // TODO: Add support for IAM Identity Center
  }

  async removeAllIAMRoles() {
    if (this.args.debug) console.log('removeAllIAMRoles()')
    const iamClient = new IAM.IAMClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await iamClient.send(new IAM.ListRolesCommand({}))

    for (const role of result.Roles ?? []) {
      // Detach all policies
      const attachedPolicies = await iamClient.send(new IAM.ListAttachedRolePoliciesCommand({RoleName: role.RoleName!}))
      for (const policy of attachedPolicies.AttachedPolicies ?? []) {
        try {
          if (this.args.debug) console.log(`detach policy: ${policy.PolicyName}`)
          await iamClient.send(
            new IAM.DetachRolePolicyCommand({
              RoleName: role.RoleName!,
              PolicyArn: policy.PolicyArn!,
            }),
          )
        } catch (err) {
          if (this.args.debug) console.error(`Error ${policy.PolicyName} in ${role.RoleName}`)
        }
      }

      // Delete all policies
      const policies = await iamClient.send(new IAM.ListRolePoliciesCommand({RoleName: role.RoleName!}))
      for (const policy of policies.PolicyNames ?? []) {
        try {
          if (this.args.debug) console.log(`delete policy: ${policy}`)
          await iamClient.send(new IAM.DeleteRolePolicyCommand({RoleName: role.RoleName!, PolicyName: policy}))
        } catch (err) {
          if (this.args.debug) console.error(`Error ${policy} in ${role.RoleName}`)
        }
      }

      // Delete role
      if (this.args.debug) console.log(`delete role: ${role.RoleName}`)
      try {
        await iamClient.send(new IAM.DeleteRoleCommand({RoleName: role.RoleName!}))
      } catch (err) {
        if (this.args.debug) console.error(`Error ${role.RoleName}`)
      }
    }
  }

  async removeAllEventBridgeRules() {
    if (this.args.debug) console.log('removeAllEventBridgeRules()')
    const eventBridgeClient = new EventBridge.EventBridgeClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await eventBridgeClient.send(new EventBridge.ListRulesCommand({}))

    for (const rule of result.Rules ?? []) {
      try {
        if (this.args.debug) console.log(`delete rule: ${rule.Name}`)
        await eventBridgeClient.send(new EventBridge.DeleteRuleCommand({Name: rule.Name!}))
      } catch (err) {
        if (this.args.debug) console.error(`Error ${rule.Name}`)
      }
    }
  }

  async removeAllCloudFrontDistributions() {
    if (this.args.debug) console.log('removeAllCloudFrontDistributions()')
    const cfClient = new CloudFront.CloudFrontClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await cfClient.send(new CloudFront.ListDistributionsCommand({}))

    for (const distribution of result.DistributionList?.Items ?? []) {
      try {
        const previousDistributionConfig = await cfClient.send(
          new CloudFront.GetDistributionCommand({Id: distribution.Id!}),
        )
        previousDistributionConfig.Distribution!.DistributionConfig!.Enabled = false

        // Update Enabled to false
        const updateResult = await cfClient.send(
          new CloudFront.UpdateDistributionCommand({
            Id: distribution.Id!,
            DistributionConfig: previousDistributionConfig.Distribution!.DistributionConfig!,
            IfMatch: previousDistributionConfig.ETag!,
          }),
        )

        // FIXME: It always fails on: Distribution has not been disabled.
        // Delete
        await cfClient.send(
          new CloudFront.DeleteDistributionCommand({
            Id: distribution.Id!,
            IfMatch: updateResult.ETag!,
          }),
        )
        if (this.args.debug) console.log(`delete distribution: ${distribution.Id}`)
      } catch (err) {
        if (this.args.debug) console.error(`Error: ${distribution.Id}: ${err}`)
      }
    }
  }

  async removeAllACMCertificates() {
    if (this.args.debug) console.log('removeAllACMCertificates()')
    const acmClient = new ACM.ACMClient({
      region: this.region,
      credentials: this.args.ssoProfile ? await this.getSSOCredentials() : undefined,
    })
    const result = await acmClient.send(new ACM.ListCertificatesCommand({}))

    for (const certificate of result.CertificateSummaryList ?? []) {
      try {
        if (this.args.debug) console.log(`delete certificate: ${certificate.CertificateArn}`)
        await acmClient.send(new ACM.DeleteCertificateCommand({CertificateArn: certificate.CertificateArn!}))
      } catch (err) {
        if (this.args.debug) console.error(`Error ${certificate.CertificateArn}`)
      }
    }
  }
}

export default function main() {
  const parser = new ArgumentParser({description: 'aws cli abstraction'})

  parser.add_argument('--sso-profile', {
    nargs: '?',
    default: undefined,
    help: 'AWS profile name, configured in ~/.aws/credentials or ~/.aws/config using sso',
  })
  parser.add_argument('--clean', {
    nargs: '+',
    default: [],
    help: 'Possible values: all, s3, cloudformation, ecr, lambda, iam-roles, eventbridge, cloudfront, acm',
  })
  parser.add_argument('--debug', {
    nargs: '?',
    default: process.env.DEBUG === '1',
    type: Boolean,
    help: 'Possible values: all, s3, cloudformation, ecr, lambda, iam-roles, eventbridge, cloudfront, acm',
  })

  const args = parser.parse_args()

  const awsRemoveAll = new AWSRemoveAll(args)
  const removeFunc: {[key: string]: () => void} = {
    cloudformation: () => awsRemoveAll.removeAllCloudFormationStacks(),
    s3: () => awsRemoveAll.removeAllS3Buckets(),
    ecr: () => awsRemoveAll.removeAllECRRepositories(),
    lambda: () => awsRemoveAll.removeAllLambdaFunctions(),
    iam_roles: () => awsRemoveAll.removeAllIAMRoles(),
    eventbridge: () => awsRemoveAll.removeAllEventBridgeRules(),
    cloudfront: () => awsRemoveAll.removeAllCloudFrontDistributions(),
    acm: () => awsRemoveAll.removeAllACMCertificates(),
  }

  for (const value of args['clean'] ?? []) {
    if (value === 'all') {
      for (const func in removeFunc) removeFunc[func]()
      return
    }

    // else iterate over the list and call the functions
    removeFunc[value]()
  }
}

main()