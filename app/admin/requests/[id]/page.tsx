


          .assignmentHistoryItem > div {

            display: flex;

            justify-content: space-between;

            gap: 12px;

            flex-wrap: wrap;

          }



          .assignmentHistoryItem span {

            color: #6b7280;

            font-size: 0.86rem;

          }



          .assignmentHistoryItem p {

            margin: 0;

            white-space: pre-wrap;

            line-height: 1.7;

          }



          .requestItemsTotal {

            display: flex;

            justify-content: space-between;

            align-items: center;

            gap: 16px;

            padding: 14px;

            border: 1px solid rgba(0, 0, 0, 0.1);

            border-radius: 12px;

            font-size: 0.95rem;

          }



          .requestItemsTotal strong {

            font-size: 1.05rem;

          }



          @media (max-width: 800px) {

            .requestDetailGrid {

              grid-template-columns: 1fr;

            }



            .detailFields {

              grid-template-columns: 1fr;

            }



            .detailWide {

              grid-column: auto;

            }



            .detailCardHeader {

              flex-direction: column;

            }



            .requestItemsTotal {

              align-items: flex-start;

              flex-direction: column;

            }

          }

        `}</style>

      </div>

    </main>

  );

}