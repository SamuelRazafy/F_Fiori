sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, Fragment, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap.ui.demo.zlistperssam.controller.View1", {

        onInit: function () {
            // Optionnel : si tu veux un JSONModel temporaire pour le formulaire "new"
            // (mais ici on utilise directement le contexte OData via createEntry)
            var oViewModel = new sap.ui.model.json.JSONModel({
                busy: false
            });
            this.getView().setModel(oViewModel, "view");
        },

        // =====================================
        //          CREATE - Ouvrir le dialog
        // =====================================
        onCrerButtonPress: function () {
            var oView = this.getView();
            var oModel = oView.getModel(); // le modèle OData par défaut (mainService)

            if (!this._oCreateDialog) {
                this._oCreateDialog = Fragment.load({
                    id: oView.getId(),
                    name: "sap.ui.demo.zlistperssam.fragment.CreateDialog", // adapte le chemin si ton fragment est ailleurs
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }

            this._oCreateDialog.then(function (oDialog) {
                // Créer une entrée temporaire dans le modèle OData
                var oContext = oModel.createEntry("/ZLIST_PERS_SAMSet", {
                    properties: { // optionnel : valeurs par défaut si besoin
                        Identifiant: "",
                        Nom: "",
                        Prenoms: ""
                    }
                });

                // Binder le VBox (ou le Dialog) au nouveau contexte
                // oDialog.setBindingContext(oContext);

                // IMPORTANT : bind le VBox directement (plus sûr que le Dialog)
                var oVBox = oDialog.getContent()[0]; // assume que le premier content est le VBox
                if (oVBox && oVBox.setBindingContext) {
                    oVBox.setBindingContext(oContext);
                } else {
                    // fallback : bind le Dialog
                    oDialog.setBindingContext(oContext);
                }

                // Debug : voir immédiatement les données
                console.log("Nouveau contexte créé :", oContext.getObject());

                oDialog.open();
            }.bind(this));
        },

        // =====================================
        //          CREATE - Sauvegarder
        // =====================================

        onSauvegarderButtonPress: function () {
            var oModel = this.getView().getModel();
            var oDialog = this.byId("idCreateDialog");

            var oVBox = oDialog.getContent()[0];
            var oContext = oVBox ? oVBox.getBindingContext() : oDialog.getBindingContext();
            if (!oContext) {
                MessageToast.show("Erreur : aucun contexte de binding trouvé");
                return;
            }

            var sIdentifiant = oContext.getProperty("Identifiant") || "";
            if (!sIdentifiant.trim()) {
                MessageToast.show("L'identifiant est obligatoire");
                var oInput = this.byId("idIdentifiantInput");
                if (oInput) {
                    oInput.setValueState("Error");
                    oInput.setValueStateText("Obligatoire");
                }
                return;
            }

            // Optionnel : reset les états d'erreur précédents
            this.byId("idIdentifiantInput")?.setValueState("None");

            oModel.setUseBatch(true); // déjà fait, mais ok

            oModel.submitChanges({
                success: function (oData, oResponse) {
                    // ────────────────────────────────────────────────
                    //  Étape cruciale : vérifier les erreurs dans le batch
                    // ────────────────────────────────────────────────
                    var bHasError = false;
                    var sErrorMessage = "";

                    // oData.__batchResponses existe quand batch = true
                    if (oData && oData.__batchResponses) {
                        oData.__batchResponses.forEach(function (oBatchResponse) {
                            if (oBatchResponse.response && oBatchResponse.response.statusCode >= 400) {
                                bHasError = true;
                                // Essayer de récupérer le message business
                                try {
                                    var oErrorBody = JSON.parse(oBatchResponse.response.body);
                                    sErrorMessage = oErrorBody.error?.message?.value ||
                                        oErrorBody.error?.innererror?.errordetails?.[0]?.message ||
                                        "Erreur inconnue dans le batch";
                                } catch (e) {
                                    sErrorMessage = oBatchResponse.response.body || "Erreur serveur";
                                }
                            }
                        });
                    }

                    if (bHasError) {
                        MessageBox.error("Échec de la création : " + sErrorMessage);
                        // Option : ne pas fermer le dialog pour laisser corriger
                        // oDialog.close();   ← commenter cette ligne si tu veux garder ouvert
                        return;
                    }

                    // Tout s'est bien passé → succès réel
                    MessageToast.show("Personnel créé avec succès");
                    oDialog.close();
                    this._refreshTable();
                }.bind(this),

                error: function (oError) {
                    // Ce bloc est appelé pour les vrais problèmes techniques (pas les 400 business)
                    var sMsg = this._extractErrorMessage(oError);
                    MessageBox.error("Erreur technique lors de l'enregistrement : " + sMsg);
                }.bind(this)
            });
        },



        // =====================================
        //          Annuler création
        // =====================================
        onAnnulerButtonPress: function () {
            var oModel = this.getView().getModel();
            var oDialog = this.byId("idCreateDialog");

            // Supprimer l'entrée temporaire créée (reset changes)
            oModel.resetChanges();

            oDialog.close();
        },



        // =====================================
        //          Rafraîchir la table
        // =====================================
        onRafrachirButtonPress: function () {
            this._refreshTable();
            MessageToast.show("Table rafraîchie");
        },

        _refreshTable: function () {
            var oTable = this.byId("idZlistPersSAMSetTable");
            oTable.getBinding("items").refresh(true); // force le rechargement depuis le backend
        },

        // =====================================
        //          BONUS : DELETE (exemple sur sélection)
        // =====================================
        // Pour l'utiliser : ajoute mode="SingleSelectMaster" ou MultiSelect à ta Table
        // et un événement selectionChange="onDeleteSelected"

        onButtonSupPress: function (oEvent) {
            var oTable = this.byId("idZlistPersSAMSetTable");
            var oSelectedItem = oTable.getSelectedItem();  // pour SingleSelect

            if (!oSelectedItem) {
                MessageToast.show("Veuillez sélectionner un personnel à supprimer");
                return;
            }

            var oContext = oSelectedItem.getBindingContext();  // contexte OData de la ligne
            if (!oContext) {
                MessageBox.error("Contexte non trouvé");
                return;
            }

            var sNom = oContext.getProperty("Nom") || "cet enregistrement";
            var sMessage = `Voulez-vous vraiment supprimer ${sNom} ? Cette action est irréversible.`;

            MessageBox.confirm(sMessage, {
                title: "Confirmation de suppression",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var oModel = this.getView().getModel();

                        // Option : désactiver la table pendant l'opération
                        oTable.setBusy(true);

                        oModel.remove(oContext.getPath(), {
                            success: function () {
                                MessageToast.show("Personnel supprimé avec succès");
                                this._refreshTable();  // recharge la liste
                                oTable.setBusy(false);
                            }.bind(this),
                            error: function (oError) {
                                var sMsg = this._extractErrorMessage(oError);
                                MessageBox.error("Erreur lors de la suppression :\n" + sMsg);
                                oTable.setBusy(false);
                            }.bind(this)
                        });
                    }
                }.bind(this)
            });
        },

        // Helper pour extraire le message d'erreur OData
        _extractErrorMessage: function (oError) {
            var sMsg = "Erreur inconnue";
            try {
                var oResponse = JSON.parse(oError.responseText || oError.message || "{}");
                sMsg = oResponse.error?.message?.value || oError.message || sMsg;
            } catch (e) { }
            return sMsg;
        },

        // Nettoyage (optionnel)
        onExit: function () {
            if (this._oCreateDialog) {
                this._oCreateDialog.then(function (oDialog) {
                    oDialog.destroy();
                });
                this._oCreateDialog = null;
            }
        }

    });
});