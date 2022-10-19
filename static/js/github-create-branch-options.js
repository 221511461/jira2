// `params` and `jiraHost` are already defined in the `jira-select-card-option.js`

const goToCreateBranch = () => {
  AP.context.getToken(token => {
		const child = window.open(getCreateBranchTargetUrl());
		child.window.jiraHost = jiraHost;
		child.window.jwt = token;
    if (isAutoRedirect()) {
      const childWindowTimer = setInterval(() => {
        if (child.closed) {
          AP.navigator.go("issue", { issueKey: params.get("issueKey") });
          clearInterval(childWindowTimer);
        }
      }, 500);
    }
  });
}

const getCreateBranchTargetUrl = () => {
	const issueKey = params.get("issueKey");
	const issueSummary = params.get("issueSummary");
	if ($("#gitHubCreateBranchOptions__cloud").hasClass("gitHubCreateBranchOptions__selected")) {
		return`session/github/create-branch?issueKey=${issueKey}&issueSummary=${issueSummary}`;
	}
	const uuid = $("#ghServers").select2("val");
	return `session/github/${uuid}/create-branch?issueKey=${issueKey}&issueSummary=${issueSummary}&ghRedirect=to`;
}

$(document).ready(() => {

  $("#ghServers").auiSelect2({
    placeholder: "Select a server"
  });

  $(".gitHubCreateBranchOptions__option").click((event) => {
    event.preventDefault();
    ghServerOptionHandler(event);
  });

  $("#createBranchOptionsForm").submit((event) => {
    event.preventDefault();
		goToCreateBranch();
	});

  if(isAutoRedirect()) {
    goToCreateBranch();
  } else {
    $(".gitHubCreateBranchOptions").show();
    $(".gitHubCreateBranchOptions__loading").hide();
  }
});

const ghServerOptionHandler = (event) => {
  event.preventDefault();
  $(".gitHubCreateBranchOptions__option").removeClass("gitHubCreateBranchOptions__selected");
  $(event.target).addClass("gitHubCreateBranchOptions__selected");

  if ($(event.target).attr("id") == "gitHubCreateBranchOptions__enterprise") {
    $(".gitHubCreateBranchOptions__serversContainer").show();
  } else {
    $(".gitHubCreateBranchOptions__serversContainer").hide();
  }
};

const isAutoRedirect = () => {
  const hasCloudServer = $("#createBranchOptionsForm").attr("data-has-cloud-server");
  const gheServersCount = $("#createBranchOptionsForm").attr("data-ghe-servers-count");
  // Only GitHub cloud server connected
	if (hasCloudServer && gheServersCount == 0) {
		return true;
	}
	// Only single GitHub Enterprise connected
	if (!hasCloudServer && gheServersCount == 1) {
		return true;
	}

  return false;

};

