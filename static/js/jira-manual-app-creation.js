/* globals $, AP */
const params = new URLSearchParams(window.location.search.substring(1));
const jiraHost = params.get("xdm_e");

const openChildWindow = (url) => {
	const child = window.open(url);
	const interval = setInterval(function () {
		if (child.closed) {
			clearInterval(interval);
			AP.navigator.go(
				'addonmodule',
				{
					moduleKey: "github-post-install-page"
				}
			);
		}
	}, 1000);

	return child;
}

const handleFormErrors = (isUpdate) => {
	$(".jiraManualAppCreation__serverError").show();
	$(".errorMessageBox__message")
		.empty()
		.append("Please make sure all the details you entered are correct.")
		.append(
			'<div class="jiraManualAppCreation__serverError__linkContainer">' +
			'	<a href="https://support.atlassian.com/jira-cloud-administration/docs/manually-create-a-github-app" target="_blank">Learn more</a>' +
			'</div>'
		);
	const errorTitle = ".errorMessageBox__title";

	isUpdate
		? $(errorTitle).empty().append("We couldn't update your GitHub app.")
		: $(errorTitle).empty().append("We couldn't create your GitHub app.");
}

const gitHubAppPutRequest = (uuid, isUpdate, data) => {
	$.ajax({
		type: "PUT",
		url: `/jira/connect/enterprise/app/${uuid}`,
		data,
		success: function (response) {
			if (response.success) {
				AP.history.back();
			} else {
				handleFormErrors(isUpdate);
			}
		}
	});
}

$(document).ready(function() {
	const update = document.getElementById("Update");
	const isUpdate = update && update.innerText === "Update";

	// Display the filename and make the data valid so users don't need to upload their pem file every time
	if (isUpdate) {
		$(".jiraManualAppCreation__formNoFileUploaded").hide();
		$(".jiraManualAppCreation__formFileUploaded").css('display', 'flex');
		$("#privateKeyFile").attr("data-aui-validation-state", "valid").removeAttr("required");
	}
});

AJS.$("#jiraManualAppCreation__form").on("aui-valid-submit", (event) => {
	event.preventDefault();
	const form = event.target;
	const data = $(form).serializeObject();
	const updateElement = document.getElementById("Update");
	const isUpdate = updateElement && updateElement.innerText === "Update";
	const uuid = $(event.target).data("app-uuid");
	const appName = $(event.target).data("app-appname");
	const renderedFilename = document.getElementById("jiraManualAppCreation__uploadedFile").innerText;
	const isFileChanged = renderedFilename !== `${appName}.private-key.pem`;


	if (isFileChanged || !isUpdate) {
		const file = $("#privateKeyFile")[0].files[0];
		const reader = new FileReader();
		reader.readAsText(file);

		reader.onload = () => {
			data.privateKey = reader.result;
		};
	}

	AP.context.getToken((token) => {
		data.jwt = token;
		data.jiraHost = jiraHost;

		if (isUpdate) {
			gitHubAppPutRequest(uuid, isUpdate, data);
		} else {
			$.post("/jira/connect/enterprise/app", data, (response, _status) => {
				if (response.success) {
					// TODO: This doesn't work, will be done in ARC-1565
					const child = openChildWindow(`/session/github/${response.data.uuid}/configuration?ghRedirect=to`);
					child.window.jiraHost = jiraHost;
					child.window.jwt = token;
				} else {
					handleFormErrors(isUpdate);
				}
			});
		}
	});
});

const replaceSpacesAndChangeCasing = (str) => str.replace(/\s+/g, '-').toLowerCase();

$('#jiraManualAppCreation__uploadedFile').bind('DOMSubtreeModified', function () {
	const hasFileName = document.getElementById("jiraManualAppCreation__uploadedFile").innerText !== "";
	// value used when user is updating up and app name already exists
	const appNameFromData = $(this).data("app-appname");
	// value used when creating an app and user has entered a value in gitHubAppName
	const appNameFromInput = $( "input[name=gitHubAppName]" ).val();
	// value used when creating an app but user has not entered a value in gitHubAppName
	const unknownAppName = "< github-app-name >"; // needs spacing other AJS.flag omits the text and treats this as a HTML element

	const appName = replaceSpacesAndChangeCasing(appNameFromData)
		|| replaceSpacesAndChangeCasing(appNameFromInput)
		|| unknownAppName;
	const body = `
			<p class="jiraManualAppCreation__flag__title"><strong>Your file has been uploaded</strong></p>
			<p>Your file has been uploaded and will be </br>
			stored with the filename in the format of </br>
			${appName}.private-key.pem</p>
	`

	if (hasFileName) {
		AJS.flag({
			type: "success",
			body
		});
	}
});

$('#jiraManualAppCreation__clearUploadedFile').click(function (event) {
	event.preventDefault();
	$("#privateKeyFile").attr("data-aui-validation-state", "unvalidated").attr("required", true)
});

$(".jiraManualAppCreation__formFileInput")
	.on("dragenter click", () => {
		$(".jiraManualAppCreation__formFileDropArea").addClass("active");
	}).on("dragleave blur drop", () => {
	$(".jiraManualAppCreation__formFileDropArea").removeClass("active");
}).on("change", (event) => {
	const fileName = event.target.files[0].name;

	$(".jiraManualAppCreation__formFileUploaded").css('display', 'flex');
	$(".jiraManualAppCreation__formNoFileUploaded").hide();
	$("#jiraManualAppCreation__uploadedFile").text(fileName);
});

$("#jiraManualAppCreation__clearUploadedFile").click(() => {
	$("#jiraManualAppCreation__uploadedFile").text("");
	$(".jiraManualAppCreation__formNoFileUploaded").show();
	$(".jiraManualAppCreation__formFileUploaded").hide();

	// Resetting the input field and its errors
	$(".jiraManualAppCreation__formFileInput").attr("data-aui-validation-state", "unvalidated");
	$(".jiraManualAppCreation__formFileDropArea .error").remove();
});
