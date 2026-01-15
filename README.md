# get-job-workflow

This action returns information about the workflow that defines the currently running job.

This can be useful for reusable workflows that need to know how they were called (e.g. to run actions or fetch related files from the same ref). While GitHub Actions [does expose](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context) `github.workflow_sha` and `github.workflow_ref`, they reflect the top-most workflow file, which could be different from the workflow file that defines the currently running job.

## Usage

```yaml
- uses: jenseng/get-job-workflow@v1
  id: job-workflow
- env:
    job_workflow_ref: ${{ steps.job-workflow.outputs.ref }}
    job_workflow_sha: ${{ steps.job-workflow.outputs.sha }}
  run: |
    echo "this reusable workflow was called via $job_workflow_ref ($job_workflow_sha)"
```

This will output something like:

```
this reusable workflow was called via v1 (deadbeefdeadbeefdeadbeefdeadbeefdeadbeef)
```

## Examples

### Run an action defined at the same ref

If you only need to run actions from the same ref, you can use [dynamic-uses](https://github.com/marketplace/actions/dynamic-uses). This allows you to avoid having to use [actions/checkout](https://github.com/marketplace/actions/checkout) or deal with tokens or deploy keys.

```yaml
- uses: jenseng/get-job-workflow@v1
  id: job-workflow
- uses: jenseng/dynamic-uses@v1 # work around https://github.com/actions/runner/issues/895
  with: |
    uses: ${{ steps.job-workflow.outputs.repository }}/actions/some-action@${{ steps.job-workflow.outputs.sha }}
```

### Access other files defined at the same ref

If you need other files defined at the same ref (e.g. scripts, configuration, etc), you can use [actions/checkout](https://github.com/marketplace/actions/checkout). Note that if the ref is from private repo that is different repo than `github.repo` (i.e. you're calling reusable workflows across repositories), then you will need to set up and use a token or deploy key that grants access to the repo.

```yaml
- uses: jenseng/get-job-workflow@v1
  id: job-workflow
- uses: actions/checkout@v6
  with:
    ref: ${{ steps.job-workflow.outputs.sha }}
    repository: ${{ steps.job-workflow.outputs.repository }}
    token: ${{ inputs.some_token }}
    path: workflow-ref-checkout
- run: ./workflow-ref-checkout/some-script.sh
```

## Outputs

### sha

The SHA of the workflow file that defines the currently running job, e.g. `deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`.

### ref

The ref of the workflow file that defines the currently running job, e.g. `refs/heads/v1`. Will be blank if the workflow was called by SHA.

### path

The path to the workflow file that defines the currently running job, e.g. `.github/workflows/ci.yml`. While this would already be known to the workflow author, using the `path` output instead of hardcoding can help make your workflow resilient (e.g. if it got renamed).

### repository

The repository that contains the workflow file that defines the currently running job, e.g. `jenseng/get-job-workflow`. While this would already be known to the workflow author, using the `repository` output instead of hardcoding can help make your workflow resilient (e.g. if it got renamed or forked).

## How does it work?

Although GitHub doesn't directly expose this information, it can be reliably extracted from the worker diagnostic logs that get generated for every job. Even if debug logging is disabled, these logs are still present and accessible within the job. The basic process is as follows:

1. The action finds the `Runner.Worker` process information.
1. The action infers the `_diag` directory relative to the location of the `Runner.Worker` binary. This is necessary since the directory may be in a different location depending on the runner type (e.g. `ubuntu-latest` vs `windows-latest` vs `self-hosted`)
1. The action extracts this information from the worker log file in the `_diag` directory.

## Limitations

This action is known not to work within [containerized jobs](https://docs.github.com/en/actions/writing-workflows/choosing-where-your-workflow-runs/running-jobs-in-a-container), since the host processes and file system are not accessible from within the container.

## License

The scripts and documentation in this project are released under the [ISC License](./LICENSE.md)
