import * as _ from "underscore";
import * as AddCollectionUtility from "../../Shared/AddCollectionUtility";
import * as AutoPilotUtils from "../../Utils/AutoPilotUtils";
import * as Constants from "../../Common/Constants";
import * as DataModels from "../../Contracts/DataModels";
import * as ko from "knockout";
import * as PricingUtils from "../../Utils/PricingUtils";
import * as SharedConstants from "../../Shared/Constants";
import * as ViewModels from "../../Contracts/ViewModels";
import * as TelemetryProcessor from "../../Shared/Telemetry/TelemetryProcessor";
import { Action, ActionModifiers } from "../../Shared/Telemetry/TelemetryConstants";
import { CassandraAPIDataClient } from "../Tables/TableDataClient";
import { ContextualPaneBase } from "./ContextualPaneBase";
import { HashMap } from "../../Common/HashMap";

export default class CassandraAddCollectionPane extends ContextualPaneBase {
  public createTableQuery: ko.Observable<string>;
  public keyspaceId: ko.Observable<string>;
  public maxThroughputRU: ko.Observable<number>;
  public minThroughputRU: ko.Observable<number>;
  public tableId: ko.Observable<string>;
  public throughput: ko.Observable<number>;
  public throughputRangeText: ko.Computed<string>;
  public sharedThroughputRangeText: ko.Computed<string>;
  public userTableQuery: ko.Observable<string>;
  public requestUnitsUsageCostDedicated: ko.Computed<string>;
  public requestUnitsUsageCostShared: ko.Computed<string>;
  public costsVisible: ko.PureComputed<boolean>;
  public keyspaceHasSharedOffer: ko.Observable<boolean>;
  public keyspaceIds: ko.ObservableArray<string>;
  public keyspaceThroughput: ko.Observable<number>;
  public keyspaceCreateNew: ko.Observable<boolean>;
  public dedicateTableThroughput: ko.Observable<boolean>;
  public canRequestSupport: ko.PureComputed<boolean>;
  public throughputSpendAckText: ko.Observable<string>;
  public throughputSpendAck: ko.Observable<boolean>;
  public sharedThroughputSpendAck: ko.Observable<boolean>;
  public sharedThroughputSpendAckText: ko.Observable<string>;
  public isAutoPilotSelected: ko.Observable<boolean>;
  public selectedAutoPilotTier: ko.Observable<DataModels.AutopilotTier>;
  public selectedSharedAutoPilotTier: ko.Observable<DataModels.AutopilotTier>;
  public autoPilotTiersList: ko.ObservableArray<ViewModels.DropdownOption<DataModels.AutopilotTier>>;
  public sharedAutoPilotTiersList: ko.ObservableArray<ViewModels.DropdownOption<DataModels.AutopilotTier>>;
  public isSharedAutoPilotSelected: ko.Observable<boolean>;
  public selectedAutoPilotThroughput: ko.Observable<number>;
  public sharedAutoPilotThroughput: ko.Observable<number>;
  public autoPilotUsageCost: ko.Computed<string>;
  public sharedThroughputSpendAckVisible: ko.Computed<boolean>;
  public throughputSpendAckVisible: ko.Computed<boolean>;
  public canExceedMaximumValue: ko.PureComputed<boolean>;
  public hasAutoPilotV2FeatureFlag: ko.PureComputed<boolean>;
  public isFreeTierAccount: ko.Computed<boolean>;
  public ruToolTipText: ko.Computed<string>;
  public canConfigureThroughput: ko.PureComputed<boolean>;

  private keyspaceOffers: HashMap<DataModels.Offer>;

  constructor(options: ViewModels.PaneOptions) {
    super(options);
    this.title("Add Table");
    this.createTableQuery = ko.observable<string>("CREATE TABLE ");
    this.keyspaceCreateNew = ko.observable<boolean>(true);
    this.hasAutoPilotV2FeatureFlag = ko.pureComputed(() => this.container.hasAutoPilotV2FeatureFlag());
    this.ruToolTipText = ko.pureComputed(() => PricingUtils.getRuToolTipText(this.hasAutoPilotV2FeatureFlag()));
    this.canConfigureThroughput = ko.pureComputed(() => !this.container.isServerlessEnabled());
    this.keyspaceOffers = new HashMap<DataModels.Offer>();
    this.keyspaceIds = ko.observableArray<string>();
    this.keyspaceHasSharedOffer = ko.observable<boolean>(false);
    this.keyspaceThroughput = ko.observable<number>();
    this.keyspaceId = ko.observable<string>("");
    this.keyspaceId.subscribe((keyspaceId: string) => {
      if (this.keyspaceIds.indexOf(keyspaceId) >= 0) {
        this.keyspaceHasSharedOffer(this.keyspaceOffers.has(keyspaceId));
      }
    });
    this.keyspaceId.extend({ rateLimit: 100 });
    this.dedicateTableThroughput = ko.observable<boolean>(false);
    const throughputDefaults = this.container.collectionCreationDefaults.throughput;
    this.maxThroughputRU = ko.observable<number>(throughputDefaults.unlimitedmax);
    this.minThroughputRU = ko.observable<number>(throughputDefaults.unlimitedmin);

    this.canExceedMaximumValue = ko.pureComputed(() => this.container.canExceedMaximumValue());

    this.isFreeTierAccount = ko.computed<boolean>(() => {
      const databaseAccount = this.container && this.container.databaseAccount && this.container.databaseAccount();
      const isFreeTierAccount =
        databaseAccount && databaseAccount.properties && databaseAccount.properties.enableFreeTier;
      return isFreeTierAccount;
    });

    this.tableId = ko.observable<string>("");
    this.selectedAutoPilotTier = ko.observable<DataModels.AutopilotTier>();
    this.selectedSharedAutoPilotTier = ko.observable<DataModels.AutopilotTier>();
    this.isAutoPilotSelected = ko.observable<boolean>(false);
    this.isSharedAutoPilotSelected = ko.observable<boolean>(false);
    this.selectedAutoPilotThroughput = ko.observable<number>();
    this.sharedAutoPilotThroughput = ko.observable<number>();
    this.throughput = ko.observable<number>();
    this.throughputRangeText = ko.pureComputed<string>(() => {
      const enableAutoPilot = this.isAutoPilotSelected();
      if (!enableAutoPilot) {
        return `Throughput (${this.minThroughputRU().toLocaleString()} - ${this.maxThroughputRU().toLocaleString()} RU/s)`;
      }
      return AutoPilotUtils.getAutoPilotHeaderText(this.hasAutoPilotV2FeatureFlag());
    });
    this.sharedThroughputRangeText = ko.pureComputed<string>(() => {
      if (this.isSharedAutoPilotSelected()) {
        return AutoPilotUtils.getAutoPilotHeaderText(this.hasAutoPilotV2FeatureFlag());
      }
      return `Throughput (${this.minThroughputRU().toLocaleString()} - ${this.maxThroughputRU().toLocaleString()} RU/s)`;
    });
    this.userTableQuery = ko.observable<string>("(userid int, name text, email text, PRIMARY KEY (userid))");
    this.keyspaceId.subscribe(keyspaceId => {
      this.createTableQuery(`CREATE TABLE ${keyspaceId}.`);
    });

    this.throughputSpendAckText = ko.observable<string>();
    this.throughputSpendAck = ko.observable<boolean>(false);
    this.sharedThroughputSpendAck = ko.observable<boolean>(false);
    this.sharedThroughputSpendAckText = ko.observable<string>();

    this.resetData();

    this.container.flight.subscribe(() => {
      this.resetData();
    });

    this.requestUnitsUsageCostDedicated = ko.computed(() => {
      const account = this.container.databaseAccount();
      if (!account) {
        return "";
      }

      const serverId = this.container.serverId();
      const regions =
        (account &&
          account.properties &&
          account.properties.readLocations &&
          account.properties.readLocations.length) ||
        1;
      const multimaster = (account && account.properties && account.properties.enableMultipleWriteLocations) || false;
      const offerThroughput: number = this.throughput();
      let estimatedSpend: string;
      let estimatedDedicatedSpendAcknowledge: string;
      if (!this.isAutoPilotSelected()) {
        estimatedSpend = PricingUtils.getEstimatedSpendHtml(
          offerThroughput,
          serverId,
          regions,
          multimaster,
          false /*rupmEnabled*/
        );
        estimatedDedicatedSpendAcknowledge = PricingUtils.getEstimatedSpendAcknowledgeString(
          offerThroughput,
          serverId,
          regions,
          multimaster,
          false /*rupmEnabled*/,
          this.isAutoPilotSelected()
        );
      } else {
        estimatedSpend = PricingUtils.getEstimatedAutoscaleSpendHtml(
          this.selectedAutoPilotThroughput(),
          serverId,
          regions,
          multimaster
        );
        estimatedDedicatedSpendAcknowledge = PricingUtils.getEstimatedSpendAcknowledgeString(
          this.selectedAutoPilotThroughput(),
          serverId,
          regions,
          multimaster,
          false /*rupmEnabled*/,
          this.isAutoPilotSelected()
        );
      }
      this.throughputSpendAckText(estimatedDedicatedSpendAcknowledge);
      return estimatedSpend;
    });

    this.requestUnitsUsageCostShared = ko.computed(() => {
      const account = this.container.databaseAccount();
      if (!account) {
        return "";
      }

      const serverId = this.container.serverId();
      const regions =
        (account &&
          account.properties &&
          account.properties.readLocations &&
          account.properties.readLocations.length) ||
        1;
      const multimaster = (account && account.properties && account.properties.enableMultipleWriteLocations) || false;
      let estimatedSpend: string;
      let estimatedSharedSpendAcknowledge: string;
      if (!this.isSharedAutoPilotSelected()) {
        estimatedSpend = PricingUtils.getEstimatedSpendHtml(
          this.keyspaceThroughput(),
          serverId,
          regions,
          multimaster,
          false /*rupmEnabled*/
        );
        estimatedSharedSpendAcknowledge = PricingUtils.getEstimatedSpendAcknowledgeString(
          this.keyspaceThroughput(),
          serverId,
          regions,
          multimaster,
          false /*rupmEnabled*/,
          this.isSharedAutoPilotSelected()
        );
      } else {
        estimatedSpend = PricingUtils.getEstimatedAutoscaleSpendHtml(
          this.sharedAutoPilotThroughput(),
          serverId,
          regions,
          multimaster
        );
        estimatedSharedSpendAcknowledge = PricingUtils.getEstimatedSpendAcknowledgeString(
          this.sharedAutoPilotThroughput(),
          serverId,
          regions,
          multimaster,
          false /*rupmEnabled*/,
          this.isSharedAutoPilotSelected()
        );
      }
      this.sharedThroughputSpendAckText(estimatedSharedSpendAcknowledge);
      return estimatedSpend;
    });

    this.costsVisible = ko.pureComputed(() => {
      return !this.container.isEmulator;
    });

    this.canRequestSupport = ko.pureComputed(() => {
      if (!this.container.isEmulator && !this.container.isTryCosmosDBSubscription()) {
        const offerThroughput: number = this.throughput();
        return offerThroughput <= 100000;
      }

      return false;
    });

    this.sharedThroughputSpendAckVisible = ko.computed<boolean>(() => {
      const autoscaleThroughput = this.sharedAutoPilotThroughput() * 1;
      if (!this.hasAutoPilotV2FeatureFlag() && this.isSharedAutoPilotSelected()) {
        return autoscaleThroughput > SharedConstants.CollectionCreation.DefaultCollectionRUs100K;
      }

      return this.keyspaceThroughput() > SharedConstants.CollectionCreation.DefaultCollectionRUs100K;
    });

    this.throughputSpendAckVisible = ko.pureComputed<boolean>(() => {
      const autoscaleThroughput = this.selectedAutoPilotThroughput() * 1;
      if (!this.hasAutoPilotV2FeatureFlag() && this.isAutoPilotSelected()) {
        return autoscaleThroughput > SharedConstants.CollectionCreation.DefaultCollectionRUs100K;
      }

      return this.throughput() > SharedConstants.CollectionCreation.DefaultCollectionRUs100K;
    });

    if (!!this.container) {
      const updateKeyspaceIds: (keyspaces: ViewModels.Database[]) => void = (
        newKeyspaceIds: ViewModels.Database[]
      ): void => {
        const cachedKeyspaceIdsList = _.map(newKeyspaceIds, (keyspace: ViewModels.Database) => {
          if (keyspace && keyspace.offer && !!keyspace.offer()) {
            this.keyspaceOffers.set(keyspace.id(), keyspace.offer());
          }
          return keyspace.id();
        });
        this.keyspaceIds(cachedKeyspaceIdsList);
      };
      this.container.nonSystemDatabases.subscribe((newDatabases: ViewModels.Database[]) =>
        updateKeyspaceIds(newDatabases)
      );
      updateKeyspaceIds(this.container.nonSystemDatabases());
    }

    this.autoPilotTiersList = ko.observableArray<ViewModels.DropdownOption<DataModels.AutopilotTier>>(
      AutoPilotUtils.getAvailableAutoPilotTiersOptions()
    );
    this.sharedAutoPilotTiersList = ko.observableArray<ViewModels.DropdownOption<DataModels.AutopilotTier>>(
      AutoPilotUtils.getAvailableAutoPilotTiersOptions()
    );

    this.autoPilotUsageCost = ko.pureComputed<string>(() => {
      const autoPilot = this._getAutoPilot();
      if (!autoPilot) {
        return "";
      }
      const isDatabaseThroughput: boolean = this.keyspaceCreateNew();
      return !this.hasAutoPilotV2FeatureFlag()
        ? PricingUtils.getAutoPilotV3SpendHtml(autoPilot.maxThroughput, isDatabaseThroughput)
        : PricingUtils.getAutoPilotV2SpendHtml(autoPilot.autopilotTier, isDatabaseThroughput);
    });
  }

  public decreaseThroughput() {
    let offerThroughput: number = this.throughput();

    if (offerThroughput > this.minThroughputRU()) {
      offerThroughput -= 100;
      this.throughput(offerThroughput);
    }
  }

  public increaseThroughput() {
    let offerThroughput: number = this.throughput();

    if (offerThroughput < this.maxThroughputRU()) {
      offerThroughput += 100;
      this.throughput(offerThroughput);
    }
  }

  public open() {
    super.open();
    const addCollectionPaneOpenMessage = {
      databaseAccountName: this.container.databaseAccount().name,
      defaultExperience: this.container.defaultExperience(),
      collection: ko.toJS({
        id: this.tableId(),
        storage: Constants.BackendDefaults.multiPartitionStorageInGb,
        offerThroughput: this.throughput(),
        partitionKey: "",
        databaseId: this.keyspaceId(),
        rupm: false
      }),
      subscriptionType: ViewModels.SubscriptionType[this.container.subscriptionType()],
      subscriptionQuotaId: this.container.quotaId(),
      defaultsCheck: {
        storage: "u",
        throughput: this.throughput(),
        flight: this.container.flight()
      },
      dataExplorerArea: Constants.Areas.ContextualPane
    };
    const focusElement = document.getElementById("keyspace-id");
    focusElement && focusElement.focus();
    TelemetryProcessor.trace(Action.CreateCollection, ActionModifiers.Open, addCollectionPaneOpenMessage);
  }

  public submit() {
    if (!this._isValid()) {
      return;
    }
    this.isExecuting(true);
    const autoPilotCommand = `cosmosdb_autoscale_max_throughput`;
    let createTableAndKeyspacePromise: Q.Promise<any>;
    const toCreateKeyspace: boolean = this.keyspaceCreateNew();
    const useAutoPilotForKeyspace: boolean =
      (!this.hasAutoPilotV2FeatureFlag() && this.isSharedAutoPilotSelected() && !!this.sharedAutoPilotThroughput()) ||
      (this.hasAutoPilotV2FeatureFlag() && this.isSharedAutoPilotSelected() && !!this.selectedSharedAutoPilotTier());
    const createKeyspaceQueryPrefix: string = `CREATE KEYSPACE ${this.keyspaceId().trim()} WITH REPLICATION = { 'class' : 'SimpleStrategy', 'replication_factor' : 3 }`;
    const createKeyspaceQuery: string = this.keyspaceHasSharedOffer()
      ? useAutoPilotForKeyspace
        ? !this.hasAutoPilotV2FeatureFlag()
          ? `${createKeyspaceQueryPrefix} AND ${autoPilotCommand}=${this.sharedAutoPilotThroughput()};`
          : `${createKeyspaceQueryPrefix} AND ${autoPilotCommand}=${this.selectedSharedAutoPilotTier()};`
        : `${createKeyspaceQueryPrefix} AND cosmosdb_provisioned_throughput=${this.keyspaceThroughput()};`
      : `${createKeyspaceQueryPrefix};`;
    const createTableQueryPrefix: string = `${this.createTableQuery()}${this.tableId().trim()} ${this.userTableQuery()}`;
    let createTableQuery: string;

    if (this.canConfigureThroughput() && (this.dedicateTableThroughput() || !this.keyspaceHasSharedOffer())) {
      if (this.isAutoPilotSelected() && this.selectedAutoPilotThroughput()) {
        createTableQuery = `${createTableQueryPrefix} WITH ${autoPilotCommand}=${this.selectedAutoPilotThroughput()};`;
      } else {
        createTableQuery = `${createTableQueryPrefix} WITH cosmosdb_provisioned_throughput=${this.throughput()};`;
      }
    } else {
      createTableQuery = `${createTableQueryPrefix};`;
    }

    const addCollectionPaneStartMessage = {
      databaseAccountName: this.container.databaseAccount().name,
      defaultExperience: this.container.defaultExperience(),
      collection: ko.toJS({
        id: this.tableId(),
        storage: Constants.BackendDefaults.multiPartitionStorageInGb,
        offerThroughput: this.throughput(),
        partitionKey: "",
        databaseId: this.keyspaceId(),
        rupm: false,
        hasDedicatedThroughput: this.dedicateTableThroughput()
      }),
      keyspaceHasSharedOffer: this.keyspaceHasSharedOffer(),
      subscriptionType: ViewModels.SubscriptionType[this.container.subscriptionType()],
      subscriptionQuotaId: this.container.quotaId(),
      defaultsCheck: {
        storage: "u",
        throughput: this.throughput(),
        flight: this.container.flight()
      },
      dataExplorerArea: Constants.Areas.ContextualPane,
      toCreateKeyspace: toCreateKeyspace,
      createKeyspaceQuery: createKeyspaceQuery,
      createTableQuery: createTableQuery
    };
    const startKey: number = TelemetryProcessor.traceStart(Action.CreateCollection, addCollectionPaneStartMessage);
    if (toCreateKeyspace) {
      createTableAndKeyspacePromise = (<CassandraAPIDataClient>this.container.tableDataClient).createTableAndKeyspace(
        this.container.databaseAccount().properties.cassandraEndpoint,
        this.container.databaseAccount().id,
        this.container,
        createTableQuery,
        createKeyspaceQuery
      );
    } else {
      createTableAndKeyspacePromise = (<CassandraAPIDataClient>this.container.tableDataClient).createTableAndKeyspace(
        this.container.databaseAccount().properties.cassandraEndpoint,
        this.container.databaseAccount().id,
        this.container,
        createTableQuery
      );
    }
    createTableAndKeyspacePromise.then(
      () => {
        this.container.refreshAllDatabases();
        this.isExecuting(false);
        this.close();
        const addCollectionPaneSuccessMessage = {
          databaseAccountName: this.container.databaseAccount().name,
          defaultExperience: this.container.defaultExperience(),
          collection: ko.toJS({
            id: this.tableId(),
            storage: Constants.BackendDefaults.multiPartitionStorageInGb,
            offerThroughput: this.throughput(),
            partitionKey: "",
            databaseId: this.keyspaceId(),
            rupm: false,
            hasDedicatedThroughput: this.dedicateTableThroughput()
          }),
          keyspaceHasSharedOffer: this.keyspaceHasSharedOffer(),
          subscriptionType: ViewModels.SubscriptionType[this.container.subscriptionType()],
          subscriptionQuotaId: this.container.quotaId(),
          defaultsCheck: {
            storage: "u",
            throughput: this.throughput(),
            flight: this.container.flight()
          },
          dataExplorerArea: Constants.Areas.ContextualPane,
          toCreateKeyspace: toCreateKeyspace,
          createKeyspaceQuery: createKeyspaceQuery,
          createTableQuery: createTableQuery
        };
        TelemetryProcessor.traceSuccess(Action.CreateCollection, addCollectionPaneSuccessMessage, startKey);
      },
      reason => {
        this.formErrors(reason.exceptionMessage);
        this.isExecuting(false);
        const addCollectionPaneFailedMessage = {
          databaseAccountName: this.container.databaseAccount().name,
          defaultExperience: this.container.defaultExperience(),
          collection: {
            id: this.tableId(),
            storage: Constants.BackendDefaults.multiPartitionStorageInGb,
            offerThroughput: this.throughput(),
            partitionKey: "",
            databaseId: this.keyspaceId(),
            rupm: false,
            hasDedicatedThroughput: this.dedicateTableThroughput()
          },
          keyspaceHasSharedOffer: this.keyspaceHasSharedOffer(),
          subscriptionType: ViewModels.SubscriptionType[this.container.subscriptionType()],
          subscriptionQuotaId: this.container.quotaId(),
          defaultsCheck: {
            storage: "u",
            throughput: this.throughput(),
            flight: this.container.flight()
          },
          dataExplorerArea: Constants.Areas.ContextualPane,
          toCreateKeyspace: toCreateKeyspace,
          createKeyspaceQuery: createKeyspaceQuery,
          createTableQuery: createTableQuery,
          error: reason
        };
        TelemetryProcessor.traceFailure(Action.CreateCollection, addCollectionPaneFailedMessage, startKey);
      }
    );
  }

  public resetData() {
    super.resetData();
    const throughputDefaults = this.container.collectionCreationDefaults.throughput;
    this.isAutoPilotSelected(false);
    this.isSharedAutoPilotSelected(false);
    this.selectedAutoPilotTier(null);
    this.selectedSharedAutoPilotTier(null);
    this.selectedAutoPilotThroughput(AutoPilotUtils.minAutoPilotThroughput);
    this.sharedAutoPilotThroughput(AutoPilotUtils.minAutoPilotThroughput);
    this.throughput(AddCollectionUtility.getMaxThroughput(this.container.collectionCreationDefaults, this.container));
    this.keyspaceThroughput(throughputDefaults.shared);
    this.maxThroughputRU(throughputDefaults.unlimitedmax);
    this.minThroughputRU(throughputDefaults.unlimitedmin);
    this.createTableQuery("CREATE TABLE ");
    this.userTableQuery("(userid int, name text, email text, PRIMARY KEY (userid))");
    this.tableId("");
    this.keyspaceId("");
    this.throughputSpendAck(false);
    this.keyspaceHasSharedOffer(false);
    this.keyspaceCreateNew(true);
  }

  private _isValid(): boolean {
    const throughput = this.throughput();
    const keyspaceThroughput = this.keyspaceThroughput();

    const sharedAutoscaleThroughput = this.sharedAutoPilotThroughput() * 1;
    if (
      !this.hasAutoPilotV2FeatureFlag() &&
      this.isSharedAutoPilotSelected() &&
      sharedAutoscaleThroughput > SharedConstants.CollectionCreation.DefaultCollectionRUs100K &&
      !this.sharedThroughputSpendAck()
    ) {
      this.formErrors(`Please acknowledge the estimated monthly spend.`);
      return false;
    }

    const dedicatedAutoscaleThroughput = this.selectedAutoPilotThroughput() * 1;
    if (
      !this.hasAutoPilotV2FeatureFlag() &&
      this.isAutoPilotSelected() &&
      dedicatedAutoscaleThroughput > SharedConstants.CollectionCreation.DefaultCollectionRUs100K &&
      !this.throughputSpendAck()
    ) {
      this.formErrors(`Please acknowledge the estimated monthly spend.`);
      return false;
    }

    if (
      (this.keyspaceCreateNew() && this.keyspaceHasSharedOffer() && this.isSharedAutoPilotSelected()) ||
      this.isAutoPilotSelected()
    ) {
      const autoPilot = this._getAutoPilot();
      if (
        (!this.hasAutoPilotV2FeatureFlag() &&
          (!autoPilot ||
            !autoPilot.maxThroughput ||
            !AutoPilotUtils.isValidAutoPilotThroughput(autoPilot.maxThroughput))) ||
        (this.hasAutoPilotV2FeatureFlag() &&
          (!autoPilot || !autoPilot.autopilotTier || !AutoPilotUtils.isValidAutoPilotTier(autoPilot.autopilotTier)))
      ) {
        this.formErrors(
          !this.hasAutoPilotV2FeatureFlag()
            ? `Please enter a value greater than ${AutoPilotUtils.minAutoPilotThroughput} for autopilot throughput`
            : "Please select an Autopilot tier from the list."
        );
        return false;
      }
      return true;
    }

    if (throughput > SharedConstants.CollectionCreation.DefaultCollectionRUs100K && !this.throughputSpendAck()) {
      this.formErrors(`Please acknowledge the estimated daily spend.`);
      return false;
    }

    if (
      this.keyspaceHasSharedOffer() &&
      this.keyspaceCreateNew() &&
      keyspaceThroughput > SharedConstants.CollectionCreation.DefaultCollectionRUs100K &&
      !this.sharedThroughputSpendAck()
    ) {
      this.formErrors("Please acknowledge the estimated daily spend");
      return false;
    }

    return true;
  }

  private _getAutoPilot(): DataModels.AutoPilotCreationSettings {
    if (
      (!this.hasAutoPilotV2FeatureFlag() &&
        this.keyspaceCreateNew() &&
        this.keyspaceHasSharedOffer() &&
        this.isSharedAutoPilotSelected() &&
        this.sharedAutoPilotThroughput()) ||
      (this.hasAutoPilotV2FeatureFlag() &&
        this.keyspaceCreateNew() &&
        this.keyspaceHasSharedOffer() &&
        this.isSharedAutoPilotSelected() &&
        this.selectedSharedAutoPilotTier())
    ) {
      return !this.hasAutoPilotV2FeatureFlag()
        ? {
            maxThroughput: this.sharedAutoPilotThroughput() * 1
          }
        : { autopilotTier: this.selectedSharedAutoPilotTier() };
    }

    if (
      (!this.hasAutoPilotV2FeatureFlag() && this.selectedAutoPilotThroughput()) ||
      (this.hasAutoPilotV2FeatureFlag() && this.selectedAutoPilotTier())
    ) {
      return !this.hasAutoPilotV2FeatureFlag()
        ? {
            maxThroughput: this.selectedAutoPilotThroughput() * 1
          }
        : { autopilotTier: this.selectedAutoPilotTier() };
    }

    return undefined;
  }
}
