let queriedRepos = [];
let totalRepos = [];
let uuid;

$(document).ready(() => {
  // Fetching the list of default repos
  totalRepos = $(".default-repos").map((_, option) => ({
    id: $(option).html(),
    text: $(option).html()
  })).toArray();

  uuid = $("#createBranchForm").attr("data-ghe-uuid");
  let url = "/github/repository";
  if(uuid) {
    url = `/github/${uuid}/repository`;
  } 
  $("#ghRepo").auiSelect2({
    placeholder: "Select a repository",
    data: totalRepos,
    dropdownCssClass: "ghRepo-dropdown", // this classname is used for displaying spinner
    createSearchChoice: (term) => {
      const exists = queriedRepos.find(repo => repo.id.indexOf(term) > 1);

      if (!exists) {
        return {
          text: term,
          id: term
        }
      }
    },
    _ajaxQuery: Select2.query.ajax({
      dataType: "json",
      quietMillis: 500,
      url,
      data: term => ({
        repoName: term
      }),
      results: function (response) {
        const { repositories } = response;
        repositories.forEach(repository => {
          if (queriedRepos.filter(repo => repo.id === repository?.full_name).length < 1) {
            const additionalRepo = {
              id: repository.full_name,
              text: repository.full_name
            };
            queriedRepos.unshift(additionalRepo);
            totalRepos.unshift(additionalRepo);
          }
        });
        showLoaderInsideSelect2Dropdown("ghRepo", false);
        return {
          results: queriedRepos.length ? [{
            text: "Repositories",
            children: queriedRepos
          }] : []
        }
      }
    }),
    query: function (options) {
      const userInput = options.term;
      queriedRepos = totalRepos.filter(repo => repo.id.toUpperCase().indexOf(userInput.toUpperCase()) >= 0);
      if (userInput.length) {
        showLoaderInsideSelect2Dropdown("ghRepo", true);
        this._ajaxQuery.call(this, options);
      } else {
        options.callback({
          results: queriedRepos.length ? [{
            text: "Recently Updated Repositories",
            children: queriedRepos
          }] : []
        });
      }
    }
  })
    .on("select2-close", () => {
      showLoaderInsideSelect2Dropdown("ghRepo", false);
    });

  $("#ghParentBranch").auiSelect2({
    placeholder: "Select a branch",
    data: []
  });

  $("#ghRepo").on("change", () => {
    if(queriedRepos.length) {
      $(".no-repo-container").hide();
      loadBranches();
    } else {
      $(".no-repo-container").show();
    }
  });

  $("#createBranchForm").on("aui-valid-submit", (event) => {
    event.preventDefault();
    if (validateForm()) {
      createBranchPost();
    }
  });

  $("#cancelBtn").click(function (event) {
    event.preventDefault();
    window.close();
  });

  $("#changeLogin").click(function (event) {
    event.preventDefault();
    changeGitHubLogin();
  });

});

const loadBranches = () => {
  showLoaderOnSelect2Input("ghParentBranch", true);
  clearBranches();
  toggleSubmitDisabled(true);
  hideErrorMessage();
  const repo = getRepoDetails();
  let url = `/github/create-branch/owners/${repo.owner}/repos/${repo.name}/branches`;
  if(uuid) {
    url = `/github/${uuid}/create-branch/owners/${repo.owner}/repos/${repo.name}/branches`
  }
  $.ajax({
    type: "GET",
    url,
    success: (response) => {
      const { branches, defaultBranch } = response;
      const allBranches = branches.map((item) => ({
        id: item.name,
        name: item.name
      }));
      allBranches.unshift({ id: defaultBranch, name: defaultBranch });

      $("#ghParentBranch").auiSelect2({
        data: () => {
          return {
            text: item => item.name,
            results: allBranches
          }
        },
        formatSelection: item => item.name,
        formatResult: item => item.name,
        createSearchChoice: (term) => {
          return {
            name: term,
            id: term
          }
        }
      });
      $("#ghParentBranch").select2("val", defaultBranch);
      toggleSubmitDisabled(false);
      showLoaderOnSelect2Input("ghParentBranch", false);
    },
    error: () => {
      showErrorMessage(["Oops, failed to fetch branches!"]);
      toggleSubmitDisabled(false);
      showLoaderOnSelect2Input("ghParentBranch", false);
    }
  });
};

const validateForm = () => {
  let validated = true;
  if (!$("#ghRepo").select2("val")) {
    showValidationErrorMessage("ghRepo", "This field is required.");
    validated = false;
  }
  if (!$("#ghParentBranch").select2("val")) {
    showValidationErrorMessage("ghParentBranch", "This field is required.");
    validated = false;
  }
  return validated;
};

const showValidationErrorMessage = (id, message) => {
  const DOM = $(`#s2id_${ id }`);
  DOM.find("a.select2-choice").addClass("has-errors");
  if (DOM.find(".error-message").length < 1) {
    DOM.append(`<div class="error-message"><i class="aui-icon aui-iconfont-error"></i>${ message }</div>`);
  }
};

const createBranchPost = () => {
  let url = "/github/create-branch";
  if(uuid) {
    url = `/github/${uuid}/create-branch`;
  }
  const repo = getRepoDetails();
  const newBranchName = $("#branchNameText").val();
  const data = {
    owner: repo.owner,
    repo: repo.name,
    sourceBranchName: $("#ghParentBranch").select2("val"),
    newBranchName,
    _csrf: $("#_csrf").val(),
  };
  toggleSubmitDisabled(true);
  hideErrorMessage();

  showLoading();
  $.post(url, data)
    .done(() => {
      showSuccessScreen(repo, newBranchName);
    })
    .fail((error) => {
      toggleSubmitDisabled(false);
      showErrorMessage(error.responseJSON);
      hideLoading();
    });
};

const showLoading = () => {
  $("#createBranchForm").hide();
  $(".headerImageLogo").addClass("headerImageLogo-lg");
  $(".gitHubCreateBranch__spinner").show();
};

const showSuccessScreen = (repo, newBranchName) => {
  $(".gitHubCreateBranch__spinner").hide();
  $(".headerImageLogo").attr("src", "/public/assets/jira-github-connection-success.svg");
  $(".gitHubCreateBranch__header").html("GitHub branch created");
  $(".gitHubCreateBranch__subHeader").html(`Branch created in ${repo.owner}/${repo.name}`);
  // TODO: Redirect to the success screen with options, needs to be done after ARC-1727[https://softwareteams.atlassian.net/browse/ARC-1727]
};

const hideLoading = () => {
  $("#createBranchForm").show();
  $(".headerImageLogo").removeClass("headerImageLogo-lg");
  $(".gitHubCreateBranch__spinner").hide();
};

const toggleSubmitDisabled = (bool) => {
  $("#createBranchBtn").prop("disabled", bool);
  $("#createBranchBtn").attr("aria-disabled", String(bool));
}

const getRepoDetails = () => {
  const repoWithOwner = $("#ghRepo").select2("val").split("/");
  return {
    owner: repoWithOwner[0],
    name: repoWithOwner[1],
  }
};

const showErrorMessage = (messages) => {
  $(".gitHubCreateBranch__serverError").show();
  let errorList = '<ul class="m-1">';
  messages.map(message => errorList +=  `<li>${message}</li>`);
  errorList += '</ul>';
  $(".errorMessageBox__message").empty().append(`<div>Failed to create branch. This can be caused by one of the following reasons:</div>${errorList}`);
};

const hideErrorMessage = () => {
  $(".has-errors").removeClass("has-errors");
  $(".error-message").remove();
  $(".gitHubCreateBranch__serverError").hide();
};

const clearBranches = () => {
  $("#ghParentBranch").auiSelect2({ data: [] });
};

const showLoaderInsideSelect2Dropdown = (inputDOM, isLoading) => {
  const loader = ".select2-loader";
  const container = $(`.${ inputDOM }-dropdown`);
  const options = container.find(".select2-results");

  if (isLoading) {
    options.css("display", "none");
    if (!container.find(loader).length) {
      options.after(`<div class="select2-loader"><aui-spinner size="small"></aui-spinner></div>`);
    }
  } else {
    options.css("display", "block");
    container.find(loader).remove();
  }
};

const showLoaderOnSelect2Input = (inputDOM, isLoading) => {
  const loader = ".select2-loader";
  const container = $(`#s2id_${ inputDOM }`).parent();

  if (isLoading) {
    if (!container.find(loader).length) {
      container.prepend(`<div class="select2-loader select2-loader-for-input"><aui-spinner size="small"></aui-spinner></div>`);
      $(`#${inputDOM}`).auiSelect2("enable", false);
    }
  } else {
    container.find(loader).remove();
    $(`#${inputDOM}`).auiSelect2("enable", true);
  }
}

const changeGitHubLogin = () => {
  $.ajax({
    type: "GET",
    url: `/github/create-branch/change-github-login`,
    success: (data) => {
      window.open(data.baseUrl, "_blank");
    },
    error: (error) => {
      console.log(error);
    }

  });

};