/**
 * This adapter is responsible to render the React component
 * If the component signals a change through the callback passed in the properties, it must render the React component when appropriate
 * and update any knockout observables passed from the parent.
 */

import * as ko from "knockout";
import * as React from "react";
import { ReactAdapter } from "../../../Bindings/ReactBindingHandler";
import { ControlBarComponent } from "./ControlBarComponent";
import { CommandButtonComponentProps } from "../../Controls/CommandButton/CommandButtonComponent";

export class ControlBarComponentAdapter implements ReactAdapter {
  public parameters: ko.Observable<number>;

  constructor(private buttons: ko.ObservableArray<CommandButtonComponentProps>) {
    this.buttons.subscribe(() => this.forceRender());
    this.parameters = ko.observable<number>(Date.now());
  }

  public renderComponent(): JSX.Element {
    return <ControlBarComponent buttons={this.buttons()} />;
  }

  public forceRender(): void {
    window.requestAnimationFrame(() => this.parameters(Date.now()));
  }
}
