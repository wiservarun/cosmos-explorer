import { DefaultButton, IButtonProps, PrimaryButton } from "office-ui-fabric-react";
import * as React from "react";
import { IGitHubBranch, IGitHubRepo } from "../../../GitHub/GitHubClient";
import { AddRepoComponent, AddRepoComponentProps } from "./AddRepoComponent";
import { AuthorizeAccessComponent, AuthorizeAccessComponentProps } from "./AuthorizeAccessComponent";
import { ChildrenMargin, ButtonsFooterStyle, ContentFooterStyle } from "./GitHubStyleConstants";
import { ReposListComponent, ReposListComponentProps } from "./ReposListComponent";

export interface GitHubReposComponentProps {
  showAuthorizeAccess: boolean;
  authorizeAccessProps: AuthorizeAccessComponentProps;
  reposListProps: ReposListComponentProps;
  addRepoProps: AddRepoComponentProps;
  resetConnection: () => void;
  onOkClick: () => void;
  onCancelClick: () => void;
}

export interface RepoListItem {
  key: string;
  repo: IGitHubRepo;
  branches: IGitHubBranch[];
}

export class GitHubReposComponent extends React.Component<GitHubReposComponentProps> {
  public static readonly ConnectToGitHubTitle = "Connect to GitHub";
  public static readonly ManageGitHubRepoTitle = "Manage GitHub settings";
  private static readonly ManageGitHubRepoDescription =
    "Select your GitHub repos and branch(es) to pin to your notebooks workspace.";
  private static readonly ManageGitHubRepoResetConnection = "View or change your GitHub authorization settings.";
  private static readonly OKButtonText = "OK";
  private static readonly CancelButtonText = "Cancel";

  public render(): JSX.Element {
    const header: JSX.Element = (
      <p>
        {this.props.showAuthorizeAccess
          ? GitHubReposComponent.ConnectToGitHubTitle
          : GitHubReposComponent.ManageGitHubRepoTitle}
      </p>
    );

    const content: JSX.Element = this.props.showAuthorizeAccess ? (
      <AuthorizeAccessComponent {...this.props.authorizeAccessProps} />
    ) : (
      <>
        <p>{GitHubReposComponent.ManageGitHubRepoDescription}</p>
        <ReposListComponent {...this.props.reposListProps} />
      </>
    );

    const okProps: IButtonProps = {
      text: GitHubReposComponent.OKButtonText,
      ariaLabel: GitHubReposComponent.OKButtonText,
      onClick: this.props.onOkClick
    };

    const cancelProps: IButtonProps = {
      text: GitHubReposComponent.CancelButtonText,
      ariaLabel: GitHubReposComponent.CancelButtonText,
      onClick: this.props.onCancelClick
    };

    return (
      <>
        <div className={"firstdivbg headerline"}>{header}</div>
        <div className={"paneMainContent"}>{content}</div>
        {!this.props.showAuthorizeAccess && (
          <>
            <div className={"paneFooter"} style={ContentFooterStyle}>
              <AddRepoComponent {...this.props.addRepoProps} />
            </div>
            <div className={"paneFooter"} style={ButtonsFooterStyle}>
              <PrimaryButton {...okProps} />
              <DefaultButton style={{ marginLeft: ChildrenMargin }} {...cancelProps} />
            </div>
          </>
        )}
      </>
    );
  }
}